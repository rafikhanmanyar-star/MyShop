import { getDatabaseService } from './databaseService.js';

function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function generateOrderNumber(): string {
    const now = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MO-${datePart}-${randPart}`;
}

const VALID_STATUSES = ['Pending', 'Confirmed', 'Packed', 'OutForDelivery', 'Delivered', 'Cancelled'] as const;
type OrderStatus = typeof VALID_STATUSES[number];

const VALID_TRANSITIONS: Record<string, string[]> = {
    Pending: ['Confirmed', 'Cancelled'],
    Confirmed: ['Packed', 'Cancelled'],
    Packed: ['OutForDelivery', 'Cancelled'],
    OutForDelivery: ['Delivered', 'Cancelled'],
    Delivered: [],   // terminal
    Cancelled: [],   // terminal
};

export interface PlaceOrderInput {
    customerId: string;
    branchId?: string;
    items: {
        productId: string;
        quantity: number;
    }[];
    deliveryAddress?: string;
    deliveryLat?: number;
    deliveryLng?: number;
    deliveryNotes?: string;
    paymentMethod?: string;
    idempotencyKey?: string;
}

export class MobileOrderService {
    private db = getDatabaseService();

    // ─── Public Product Catalog (for mobile browsing) ──────────────────

    async getProductsForMobile(tenantId: string, opts: {
        cursor?: string;
        limit?: number;
        categoryId?: string;
        search?: string;
    } = {}) {
        const limit = Math.min(opts.limit || 20, 50);
        const params: any[] = [tenantId];
        let paramIdx = 2;

        let where = `WHERE p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE`;

        if (opts.categoryId) {
            where += ` AND p.category_id = $${paramIdx}`;
            params.push(opts.categoryId);
            paramIdx++;
        }

        if (opts.search) {
            where += ` AND (p.name ILIKE $${paramIdx} OR p.sku ILIKE $${paramIdx})`;
            params.push(`%${opts.search}%`);
            paramIdx++;
        }

        if (opts.cursor) {
            // Cursor is base64-encoded "created_at|id"
            try {
                const decoded = Buffer.from(opts.cursor, 'base64').toString('utf-8');
                const [cursorDate, cursorId] = decoded.split('|');
                where += ` AND (p.created_at, p.id) < ($${paramIdx}, $${paramIdx + 1})`;
                params.push(cursorDate, cursorId);
                paramIdx += 2;
            } catch { /* ignore invalid cursor */ }
        }

        const query = `
      SELECT p.id, p.name, p.sku, p.barcode, p.category_id,
             p.unit, p.retail_price, p.tax_rate, p.image_url,
             p.mobile_price, p.mobile_description, p.mobile_sort_order,
             c.name as category_name,
             COALESCE(
               (SELECT SUM(i.quantity_on_hand - i.quantity_reserved)
                FROM shop_inventory i WHERE i.product_id = p.id AND i.tenant_id = $1),
               0
             ) as available_stock
      FROM shop_products p
      LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
      ${where}
      ORDER BY p.mobile_sort_order ASC, p.created_at DESC, p.id DESC
      LIMIT $${paramIdx}
    `;
        params.push(limit + 1); // +1 to check hasMore

        const rows = await this.db.query(query, params);
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit).map((r: any) => ({
            ...r,
            price: r.mobile_price != null ? parseFloat(r.mobile_price) : parseFloat(r.retail_price),
            available_stock: parseFloat(r.available_stock),
        }));

        let nextCursor: string | null = null;
        if (hasMore && items.length > 0) {
            const last = items[items.length - 1];
            nextCursor = Buffer.from(`${last.created_at}|${last.id}`).toString('base64');
        }

        return { items, nextCursor, hasMore };
    }

    async getProductDetailForMobile(tenantId: string, productId: string) {
        const rows = await this.db.query(
            `SELECT p.*, c.name as category_name,
              COALESCE(
                (SELECT SUM(i.quantity_on_hand - i.quantity_reserved)
                 FROM shop_inventory i WHERE i.product_id = p.id AND i.tenant_id = $1),
                0
              ) as available_stock
       FROM shop_products p
       LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
       WHERE p.id = $2 AND p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE`,
            [tenantId, productId]
        );
        if (rows.length === 0) return null;
        const r = rows[0];
        return {
            ...r,
            price: r.mobile_price != null ? parseFloat(r.mobile_price) : parseFloat(r.retail_price),
            available_stock: parseFloat(r.available_stock),
        };
    }

    async getCategoriesForMobile(tenantId: string) {
        return this.db.query(
            `SELECT DISTINCT c.id, c.name
       FROM categories c
       INNER JOIN shop_products p ON p.category_id = c.id AND p.tenant_id = $1
       WHERE c.tenant_id = $1 AND c.type = 'product' AND c.deleted_at IS NULL
         AND p.is_active = TRUE AND p.mobile_visible = TRUE
       ORDER BY c.name ASC`,
            [tenantId]
        );
    }

    // ─── Place Order (with stock reservation) ──────────────────────────

    async placeOrder(tenantId: string, input: PlaceOrderInput) {
        // Idempotency check
        if (input.idempotencyKey) {
            const existing = await this.db.query(
                'SELECT id, order_number, status, grand_total FROM mobile_orders WHERE idempotency_key = $1',
                [input.idempotencyKey]
            );
            if (existing.length > 0) {
                return { order: existing[0], duplicate: true };
            }
        }

        return this.db.transaction(async (client: any) => {
            // 1. Resolve warehouse (use first branch warehouse)
            let warehouseId: string | null = null;
            if (input.branchId) {
                const whRes = await client.query(
                    'SELECT id FROM shop_warehouses WHERE id = $1 AND tenant_id = $2',
                    [input.branchId, tenantId]
                );
                if (whRes.length > 0) warehouseId = whRes[0].id;
            }
            if (!warehouseId) {
                const whRes = await client.query(
                    'SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1',
                    [tenantId]
                );
                if (whRes.length > 0) warehouseId = whRes[0].id;
            }

            // 2. Validate & price each item, check stock
            let subtotal = 0;
            let taxTotal = 0;
            const resolvedItems: any[] = [];

            for (const item of input.items) {
                // Get product info
                const prodRes = await client.query(
                    `SELECT id, name, sku, retail_price, mobile_price, tax_rate
           FROM shop_products
           WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
                    [item.productId, tenantId]
                );
                if (prodRes.length === 0) {
                    throw new Error(`Product not found: ${item.productId}`);
                }
                const product = prodRes[0];
                const unitPrice = product.mobile_price != null
                    ? parseFloat(product.mobile_price)
                    : parseFloat(product.retail_price);
                const taxRate = parseFloat(product.tax_rate) || 0;

                // Check stock availability (with lock)
                if (warehouseId) {
                    const invRes = await client.query(
                        `SELECT quantity_on_hand, quantity_reserved
             FROM shop_inventory
             WHERE product_id = $1 AND warehouse_id = $2 AND tenant_id = $3
             FOR UPDATE`,
                        [item.productId, warehouseId, tenantId]
                    );

                    if (invRes.length > 0) {
                        const inv = invRes[0];
                        const available = parseFloat(inv.quantity_on_hand) - parseFloat(inv.quantity_reserved);
                        if (available < item.quantity) {
                            throw new Error(
                                `Insufficient stock for "${product.name}". Available: ${Math.max(0, available)}, Requested: ${item.quantity}`
                            );
                        }
                    }
                    // If no inventory record exists, allow order (stock not tracked for this product/warehouse)
                }

                const itemTax = unitPrice * item.quantity * (taxRate / 100);
                const itemSubtotal = unitPrice * item.quantity;

                resolvedItems.push({
                    productId: product.id,
                    productName: product.name,
                    productSku: product.sku,
                    quantity: item.quantity,
                    unitPrice,
                    taxAmount: Math.round(itemTax * 100) / 100,
                    discountAmount: 0,
                    subtotal: Math.round(itemSubtotal * 100) / 100,
                });

                subtotal += itemSubtotal;
                taxTotal += itemTax;
            }

            // 3. Get delivery fee from settings
            const settingsRes = await client.query(
                'SELECT delivery_fee, free_delivery_above, minimum_order_amount FROM mobile_ordering_settings WHERE tenant_id = $1',
                [tenantId]
            );
            let deliveryFee = 0;
            if (settingsRes.length > 0) {
                const s = settingsRes[0];
                deliveryFee = parseFloat(s.delivery_fee) || 0;
                if (s.free_delivery_above && subtotal >= parseFloat(s.free_delivery_above)) {
                    deliveryFee = 0;
                }
                if (s.minimum_order_amount && subtotal < parseFloat(s.minimum_order_amount)) {
                    throw new Error(`Minimum order amount is ${s.minimum_order_amount}. Your cart total is ${subtotal.toFixed(2)}.`);
                }
            }

            subtotal = Math.round(subtotal * 100) / 100;
            taxTotal = Math.round(taxTotal * 100) / 100;
            const grandTotal = Math.round((subtotal + taxTotal + deliveryFee) * 100) / 100;

            // 4. Create order
            const orderId = generateId('mord');
            const orderNumber = generateOrderNumber();

            await client.query(
                `INSERT INTO mobile_orders (
          id, tenant_id, customer_id, branch_id, order_number, status,
          subtotal, tax_total, discount_total, delivery_fee, grand_total,
          payment_method, payment_status,
          delivery_address, delivery_lat, delivery_lng, delivery_notes,
          idempotency_key, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,'Pending',$6,$7,0,$8,$9,$10,'Unpaid',$11,$12,$13,$14,$15,NOW(),NOW())`,
                [
                    orderId, tenantId, input.customerId, input.branchId || null,
                    orderNumber, subtotal, taxTotal, deliveryFee, grandTotal,
                    input.paymentMethod || 'COD',
                    input.deliveryAddress || null, input.deliveryLat || null,
                    input.deliveryLng || null, input.deliveryNotes || null,
                    input.idempotencyKey || null,
                ]
            );

            // 5. Insert order items
            for (const item of resolvedItems) {
                await client.query(
                    `INSERT INTO mobile_order_items (
            id, tenant_id, order_id, product_id, product_name, product_sku,
            quantity, unit_price, tax_amount, discount_amount, subtotal
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                    [
                        generateId('moi'), tenantId, orderId,
                        item.productId, item.productName, item.productSku,
                        item.quantity, item.unitPrice, item.taxAmount,
                        item.discountAmount, item.subtotal,
                    ]
                );

                // 6. Reserve stock
                if (warehouseId) {
                    await client.query(
                        `UPDATE shop_inventory
             SET quantity_reserved = quantity_reserved + $1, updated_at = NOW()
             WHERE product_id = $2 AND warehouse_id = $3 AND tenant_id = $4`,
                        [item.quantity, item.productId, warehouseId, tenantId]
                    );

                    await client.query(
                        `INSERT INTO shop_inventory_movements (
              id, tenant_id, product_id, warehouse_id, type, quantity, reference_id, reason
            ) VALUES ($1,$2,$3,$4,'Reserve',$5,$6,'Mobile order reservation')`,
                        [generateId('im'), tenantId, item.productId, warehouseId, item.quantity, orderId]
                    );
                }
            }

            // 7. Status history entry
            await client.query(
                `INSERT INTO mobile_order_status_history (id, tenant_id, order_id, from_status, to_status, changed_by, changed_by_type)
         VALUES ($1, $2, $3, NULL, 'Pending', 'system', 'system')`,
                [generateId('mosh'), tenantId, orderId]
            );

            return {
                order: {
                    id: orderId,
                    order_number: orderNumber,
                    status: 'Pending',
                    subtotal,
                    tax_total: taxTotal,
                    delivery_fee: deliveryFee,
                    grand_total: grandTotal,
                    items: resolvedItems,
                },
                duplicate: false,
            };
        });
    }

    // ─── Order Queries ─────────────────────────────────────────────────

    async getCustomerOrders(tenantId: string, customerId: string, cursor?: string, limit: number = 20) {
        const params: any[] = [tenantId, customerId];
        let paramIdx = 3;
        let cursorClause = '';

        if (cursor) {
            try {
                const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
                const [cursorDate, cursorId] = decoded.split('|');
                cursorClause = ` AND (o.created_at, o.id) < ($${paramIdx}, $${paramIdx + 1})`;
                params.push(cursorDate, cursorId);
                paramIdx += 2;
            } catch { /* ignore */ }
        }

        params.push(limit + 1);
        const rows = await this.db.query(
            `SELECT o.id, o.order_number, o.status, o.grand_total, o.payment_method,
              o.payment_status, o.delivery_address, o.created_at, o.updated_at
       FROM mobile_orders o
       WHERE o.tenant_id = $1 AND o.customer_id = $2 ${cursorClause}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT $${paramIdx}`,
            params
        );

        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit);
        let nextCursor: string | null = null;
        if (hasMore && items.length > 0) {
            const last = items[items.length - 1];
            nextCursor = Buffer.from(`${last.created_at}|${last.id}`).toString('base64');
        }

        return { items, nextCursor, hasMore };
    }

    async getOrderDetail(tenantId: string, orderId: string) {
        const orders = await this.db.query(
            `SELECT o.*, mc.phone as customer_phone, mc.name as customer_name
       FROM mobile_orders o
       LEFT JOIN mobile_customers mc ON o.customer_id = mc.id
       WHERE o.id = $1 AND o.tenant_id = $2`,
            [orderId, tenantId]
        );
        if (orders.length === 0) return null;

        const items = await this.db.query(
            'SELECT * FROM mobile_order_items WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at ASC',
            [orderId, tenantId]
        );

        const history = await this.db.query(
            'SELECT * FROM mobile_order_status_history WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at ASC',
            [orderId, tenantId]
        );

        return { ...orders[0], items, status_history: history };
    }

    // ─── Status Updates (POS side) ─────────────────────────────────────

    async updateOrderStatus(tenantId: string, orderId: string, newStatus: string, changedBy: string, changedByType: string = 'shop_user', note?: string) {
        if (!VALID_STATUSES.includes(newStatus as OrderStatus)) {
            throw new Error(`Invalid status: ${newStatus}. Valid: ${VALID_STATUSES.join(', ')}`);
        }

        const orders = await this.db.query(
            'SELECT id, status, customer_id FROM mobile_orders WHERE id = $1 AND tenant_id = $2',
            [orderId, tenantId]
        );
        if (orders.length === 0) throw new Error('Order not found');

        const currentStatus = orders[0].status;
        const allowed = VALID_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(newStatus)) {
            throw new Error(`Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none (terminal state)'}`);
        }

        return this.db.transaction(async (client: any) => {
            // Update order
            const updateFields: string[] = [`status = $1`, `updated_at = NOW()`];
            const updateParams: any[] = [newStatus];
            let pIdx = 2;

            if (newStatus === 'Delivered') {
                updateFields.push(`delivered_at = NOW()`);
                updateFields.push(`payment_status = 'Paid'`);
            }
            if (newStatus === 'Cancelled') {
                updateFields.push(`cancelled_at = NOW()`);
                updateFields.push(`cancelled_by = $${pIdx}`);
                updateParams.push(changedByType === 'customer' ? 'customer' : 'shop');
                pIdx++;
                if (note) {
                    updateFields.push(`cancellation_reason = $${pIdx}`);
                    updateParams.push(note);
                    pIdx++;
                }
            }

            updateParams.push(orderId, tenantId);
            await client.query(
                `UPDATE mobile_orders SET ${updateFields.join(', ')} WHERE id = $${pIdx} AND tenant_id = $${pIdx + 1}`,
                updateParams
            );

            // Status history
            await client.query(
                `INSERT INTO mobile_order_status_history (id, tenant_id, order_id, from_status, to_status, changed_by, changed_by_type, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [generateId('mosh'), tenantId, orderId, currentStatus, newStatus, changedBy, changedByType, note || null]
            );

            // Inventory adjustments
            if (newStatus === 'Confirmed') {
                // Move from reserved → sold (deduct on_hand, release reserved)
                await this.adjustInventoryForOrder(client, tenantId, orderId, 'confirm');
            } else if (newStatus === 'Cancelled') {
                // Release reservation
                await this.adjustInventoryForOrder(client, tenantId, orderId, 'cancel');
            }

            return { success: true, orderId, from: currentStatus, to: newStatus };
        });
    }

    private async adjustInventoryForOrder(client: any, tenantId: string, orderId: string, action: 'confirm' | 'cancel') {
        const items = await client.query(
            'SELECT product_id, quantity FROM mobile_order_items WHERE order_id = $1 AND tenant_id = $2',
            [orderId, tenantId]
        );

        const whRes = await client.query(
            'SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1',
            [tenantId]
        );
        if (whRes.length === 0) return;
        const warehouseId = whRes[0].id;

        for (const item of items) {
            const qty = parseFloat(item.quantity);

            if (action === 'confirm') {
                // Deduct from on_hand, release reserved
                await client.query(
                    `UPDATE shop_inventory
           SET quantity_on_hand = quantity_on_hand - $1,
               quantity_reserved = quantity_reserved - $1,
               updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3 AND tenant_id = $4`,
                    [qty, item.product_id, warehouseId, tenantId]
                );
                await client.query(
                    `INSERT INTO shop_inventory_movements (id, tenant_id, product_id, warehouse_id, type, quantity, reference_id, reason)
           VALUES ($1, $2, $3, $4, 'MobileSale', $5, $6, 'Mobile order confirmed')`,
                    [generateId('im'), tenantId, item.product_id, warehouseId, -qty, orderId]
                );
            } else if (action === 'cancel') {
                // Release reserved
                await client.query(
                    `UPDATE shop_inventory
           SET quantity_reserved = GREATEST(quantity_reserved - $1, 0),
               updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3 AND tenant_id = $4`,
                    [qty, item.product_id, warehouseId, tenantId]
                );
                await client.query(
                    `INSERT INTO shop_inventory_movements (id, tenant_id, product_id, warehouse_id, type, quantity, reference_id, reason)
           VALUES ($1, $2, $3, $4, 'ReleaseReserve', $5, $6, 'Mobile order cancelled')`,
                    [generateId('im'), tenantId, item.product_id, warehouseId, qty, orderId]
                );
            }
        }
    }

    // ─── Cancel by customer ────────────────────────────────────────────

    async cancelByCustomer(tenantId: string, orderId: string, customerId: string, reason?: string) {
        const orders = await this.db.query(
            'SELECT id, status, customer_id FROM mobile_orders WHERE id = $1 AND tenant_id = $2',
            [orderId, tenantId]
        );
        if (orders.length === 0) throw new Error('Order not found');
        if (orders[0].customer_id !== customerId) throw new Error('Not your order');
        if (orders[0].status !== 'Pending') {
            throw new Error('Only pending orders can be cancelled. Contact the shop for assistance.');
        }

        return this.updateOrderStatus(tenantId, orderId, 'Cancelled', customerId, 'customer', reason || 'Cancelled by customer');
    }

    // ─── POS-side queries ──────────────────────────────────────────────

    async getMobileOrdersForPOS(tenantId: string, status?: string) {
        let query = `
      SELECT o.*, mc.phone as customer_phone, mc.name as customer_name
      FROM mobile_orders o
      LEFT JOIN mobile_customers mc ON o.customer_id = mc.id
      WHERE o.tenant_id = $1
    `;
        const params: any[] = [tenantId];

        if (status) {
            query += ` AND o.status = $2`;
            params.push(status);
        }

        query += ` ORDER BY o.created_at DESC LIMIT 200`;
        return this.db.query(query, params);
    }

    async getUnsyncedOrders(tenantId: string) {
        return this.db.query(
            `SELECT o.*, mc.phone as customer_phone, mc.name as customer_name
       FROM mobile_orders o
       LEFT JOIN mobile_customers mc ON o.customer_id = mc.id
       WHERE o.tenant_id = $1 AND o.pos_synced = FALSE
       ORDER BY o.created_at ASC`,
            [tenantId]
        );
    }

    async markOrderSynced(tenantId: string, orderId: string) {
        await this.db.execute(
            'UPDATE mobile_orders SET pos_synced = TRUE, pos_synced_at = NOW() WHERE id = $1 AND tenant_id = $2',
            [orderId, tenantId]
        );
    }
}

let instance: MobileOrderService | null = null;
export function getMobileOrderService(): MobileOrderService {
    if (!instance) {
        instance = new MobileOrderService();
    }
    return instance;
}
