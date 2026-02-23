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
type PaymentStatus = 'Unpaid' | 'Paid';

const VALID_TRANSITIONS: Record<string, string[]> = {
    Pending: ['Confirmed', 'Cancelled'],
    Confirmed: ['Packed', 'Cancelled'],
    Packed: ['OutForDelivery', 'Cancelled'],
    OutForDelivery: ['Delivered', 'Cancelled'],
    Delivered: [],   // terminal — payment collected separately via collectPayment()
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
        categoryIds?: string[];
        subcategoryIds?: string[];
        brandIds?: string[];
        search?: string;
        minPrice?: number;
        maxPrice?: number;
        availability?: string;
        onSale?: boolean;
        minRating?: number;
        sortBy?: string;
    } = {}) {
        const limit = Math.min(opts.limit || 20, 50);
        const params: any[] = [tenantId];
        let paramIdx = 2;

        let where = `WHERE p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE`;

        if (opts.categoryIds && opts.categoryIds.length > 0) {
            where += ` AND p.category_id = ANY($${paramIdx})`;
            params.push(opts.categoryIds);
            paramIdx++;
        }

        if (opts.subcategoryIds && opts.subcategoryIds.length > 0) {
            where += ` AND p.subcategory_id = ANY($${paramIdx})`;
            params.push(opts.subcategoryIds);
            paramIdx++;
        }

        if (opts.brandIds && opts.brandIds.length > 0) {
            where += ` AND p.brand_id = ANY($${paramIdx})`;
            params.push(opts.brandIds);
            paramIdx++;
        }

        if (opts.search) {
            where += ` AND (p.name ILIKE $${paramIdx} OR p.sku ILIKE $${paramIdx} OR p.mobile_description ILIKE $${paramIdx})`;
            params.push(`%${opts.search}%`);
            paramIdx++;
        }

        if (opts.minPrice != null) {
            where += ` AND COALESCE(p.mobile_price, p.retail_price) >= $${paramIdx}`;
            params.push(opts.minPrice);
            paramIdx++;
        }

        if (opts.maxPrice != null) {
            where += ` AND COALESCE(p.mobile_price, p.retail_price) <= $${paramIdx}`;
            params.push(opts.maxPrice);
            paramIdx++;
        }

        if (opts.onSale === true) {
            where += ` AND p.is_on_sale = TRUE`;
        }

        if (opts.minRating != null) {
            where += ` AND p.rating_avg >= $${paramIdx}`;
            params.push(opts.minRating);
            paramIdx++;
        }

        const stockSubquery = `COALESCE((SELECT SUM(qty_on_hand - qty_res) FROM (SELECT i.quantity_on_hand as qty_on_hand, i.quantity_reserved as qty_res FROM shop_inventory i WHERE i.product_id = p.id AND i.tenant_id = $1) as inv), 0)`;

        if (opts.availability === 'in_stock') {
            where += ` AND ${stockSubquery} > 0`;
        } else if (opts.availability === 'out_of_stock') {
            where += ` AND ${stockSubquery} <= 0`;
        } else if (opts.availability === 'pre_order') {
            where += ` AND p.is_pre_order = TRUE`;
        }

        // Handle Sorting
        let orderBy = `p.mobile_sort_order ASC, p.created_at DESC, p.id DESC`;
        if (opts.sortBy) {
            switch (opts.sortBy) {
                case 'price_low_high':
                    orderBy = `COALESCE(p.mobile_price, p.retail_price) ASC, p.id DESC`;
                    break;
                case 'price_high_low':
                    orderBy = `COALESCE(p.mobile_price, p.retail_price) DESC, p.id DESC`;
                    break;
                case 'popularity':
                    orderBy = `p.popularity_score DESC, p.id DESC`;
                    break;
                case 'best_selling':
                    orderBy = `p.total_sales DESC, p.id DESC`;
                    break;
                case 'newest':
                    orderBy = `p.created_at DESC, p.id DESC`;
                    break;
                case 'top_rated':
                    orderBy = `p.rating_avg DESC, p.rating_count DESC, p.id DESC`;
                    break;
                case 'a_z':
                    orderBy = `p.name ASC, p.id DESC`;
                    break;
                case 'z_a':
                    orderBy = `p.name DESC, p.id DESC`;
                    break;
            }
        }

        if (opts.cursor) {
            try {
                const decoded = Buffer.from(opts.cursor, 'base64').toString('utf-8');
                const [cValue, cId] = decoded.split('|');
                // For simplicity, we'll only support cursor for default sort or created_at sort.
                // For other sorts, we might need a more complex cursor.
                // But let's assume if cursor is provided, it matches the current sort.
                if (opts.sortBy?.startsWith('price')) {
                    const op = opts.sortBy === 'price_low_high' ? '>' : '<';
                    where += ` AND (COALESCE(p.mobile_price, p.retail_price), p.id) ${op} ($${paramIdx}, $${paramIdx + 1})`;
                } else {
                    where += ` AND (p.created_at, p.id) < ($${paramIdx}, $${paramIdx + 1})`;
                }
                params.push(cValue, cId);
                paramIdx += 2;
            } catch { }
        }

        const query = `
      SELECT p.id, p.name, p.sku, p.category_id, p.subcategory_id, p.brand_id,
             p.unit, p.retail_price, p.tax_rate, p.image_url, p.created_at,
             p.mobile_price, p.mobile_description, p.mobile_sort_order,
             p.rating_avg, p.rating_count, p.is_on_sale, p.is_pre_order, p.discount_percentage,
             c.name as category_name,
             b.name as brand_name,
             ${stockSubquery} as available_stock
      FROM shop_products p
      LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
      LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = $1
      ${where}
      ORDER BY ${orderBy}
      LIMIT $${paramIdx}
    `;
        params.push(limit + 1);

        const rows = await this.db.query(query, params);
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit).map((r: any) => ({
            ...r,
            price: r.mobile_price != null ? (parseFloat(r.mobile_price) || 0) : (parseFloat(r.retail_price) || 0),
            available_stock: parseFloat(r.available_stock) || 0,
            rating_avg: parseFloat(r.rating_avg) || 0,
        }));

        let nextCursor: string | null = null;
        if (hasMore && items.length > 0) {
            const last = items[items.length - 1];
            // Cursor value must be PostgreSQL-friendly: use ISO timestamp for dates
            const cursorVal = opts.sortBy?.startsWith('price')
                ? last.price
                : (last.created_at instanceof Date ? last.created_at.toISOString() : new Date(last.created_at).toISOString());
            nextCursor = Buffer.from(`${cursorVal}|${last.id}`).toString('base64');
        }

        return { items, nextCursor, hasMore };
    }

    async getProductDetailForMobile(tenantId: string, productId: string) {
        const rows = await this.db.query(
            `SELECT p.*, c.name as category_name, b.name as brand_name,
              COALESCE(
                (SELECT SUM(i.quantity_on_hand - i.quantity_reserved)
                 FROM shop_inventory i WHERE i.product_id = p.id AND i.tenant_id = $1),
                0
              ) as available_stock
       FROM shop_products p
       LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
       LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = $1
       WHERE p.id = $2 AND p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE`,
            [tenantId, productId]
        );
        if (rows.length === 0) return null;
        const r = rows[0];
        return {
            ...r,
            price: r.mobile_price != null ? parseFloat(r.mobile_price) : parseFloat(r.retail_price),
            available_stock: parseFloat(r.available_stock),
            rating_avg: parseFloat(r.rating_avg) || 0,
        };
    }

    async getCategoriesForMobile(tenantId: string) {
        const categories = await this.db.query(
            `SELECT id, name, parent_id
       FROM categories
       WHERE tenant_id = $1 AND type = 'product' AND deleted_at IS NULL
       ORDER BY name ASC`,
            [tenantId]
        );

        // Return flat but with parent_id so mobile can structure them
        return categories;
    }

    async getBrandsForMobile(tenantId: string) {
        return this.db.query(
            `SELECT id, name, logo_url
           FROM shop_brands
           WHERE tenant_id = $1 AND is_active = TRUE
           ORDER BY name ASC`,
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
            // 1. Get all products and lock inventory rows for order products (for consistent stock check)
            const productIds = [...new Set(input.items.map((i: any) => i.productId))];
            const invRows = productIds.length > 0
                ? await client.query(
                    `SELECT product_id, warehouse_id, quantity_on_hand, quantity_reserved
             FROM shop_inventory
             WHERE tenant_id = $1 AND product_id = ANY($2)
             FOR UPDATE`,
                    [tenantId, productIds]
                )
                : [];

            // 2. Resolve warehouse: one that has enough stock for ALL items (so we can reserve from it)
            let warehouseId: string | null = null;
            if (input.branchId) {
                const whRes = await client.query(
                    'SELECT id FROM shop_warehouses WHERE id = $1 AND tenant_id = $2',
                    [input.branchId, tenantId]
                );
                if (whRes.length > 0) warehouseId = whRes[0].id;
            }
            if (!warehouseId) {
                // Find first warehouse that can fulfill every line item that has tracked inventory
                const warehouses = await client.query(
                    'SELECT id FROM shop_warehouses WHERE tenant_id = $1 ORDER BY id',
                    [tenantId]
                );
                for (const wh of warehouses) {
                    const wid = wh.id;
                    let canFulfill = true;
                    for (const item of input.items) {
                        const productRows = invRows.filter((r: any) => r.product_id === item.productId);
                        if (productRows.length === 0) continue; // stock not tracked for this product
                        const row = productRows.find((r: any) => r.warehouse_id === wid);
                        const available = row
                            ? Math.max(0, parseFloat(row.quantity_on_hand) - parseFloat(row.quantity_reserved))
                            : 0;
                        if (available < item.quantity) {
                            canFulfill = false;
                            break;
                        }
                    }
                    if (canFulfill) {
                        warehouseId = wid;
                        break;
                    }
                }
            }

            // 3. Validate & price each item; check stock using TOTAL across warehouses (matches catalog)
            let subtotal = 0;
            let taxTotal = 0;
            const resolvedItems: any[] = [];

            for (const item of input.items) {
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

                // Total available across all warehouses (same as mobile catalog)
                const productInvRows = invRows.filter((r: any) => r.product_id === item.productId);
                const totalAvailable = productInvRows.reduce(
                    (sum: number, r: any) =>
                        sum + Math.max(0, parseFloat(r.quantity_on_hand) - parseFloat(r.quantity_reserved)),
                    0
                );

                if (productInvRows.length > 0 && totalAvailable < item.quantity) {
                    throw new Error(
                        `Insufficient stock for "${product.name}". Available: ${Math.max(0, Math.round(totalAvailable * 100) / 100)}, Requested: ${item.quantity}`
                    );
                }

                // If a specific warehouse was chosen, ensure it has enough (we reserve from one warehouse)
                if (warehouseId && productInvRows.length > 0) {
                    const atWh = productInvRows.find((r: any) => r.warehouse_id === warehouseId);
                    const availableAtWh = atWh
                        ? Math.max(0, parseFloat(atWh.quantity_on_hand) - parseFloat(atWh.quantity_reserved))
                        : 0;
                    if (availableAtWh < item.quantity) {
                        throw new Error(
                            `Insufficient stock for "${product.name}" at selected branch. Available at branch: ${Math.max(0, availableAtWh)}, Requested: ${item.quantity}. Try another branch or leave branch unselected.`
                        );
                    }
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

            if (!warehouseId && invRows.length > 0) {
                throw new Error(
                    'Insufficient stock at a single location; stock is spread across branches. Please select a branch that has all items in stock.'
                );
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
            const createdAt = last.created_at instanceof Date ? last.created_at.toISOString() : new Date(last.created_at).toISOString();
            nextCursor = Buffer.from(`${createdAt}|${last.id}`).toString('base64');
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
                // payment_status stays 'Unpaid' — payment is collected separately via collectPayment()

                const orderData = await client.query('SELECT grand_total, payment_method, order_number, subtotal, tax_total FROM mobile_orders WHERE id = $1', [orderId]);
                if (orderData.length > 0) {
                    const { grand_total, order_number, subtotal, tax_total, payment_method } = orderData[0];

                    // Revenue recognition: Debit Accounts Receivable, Credit Revenue + COGS entries
                    try {
                        const orderItems = await client.query('SELECT product_id, quantity, subtotal FROM mobile_order_items WHERE order_id = $1', [orderId]);
                        await this.postMobileDeliveryToAccounting(client, orderId, tenantId, {
                            orderNumber: order_number,
                            grandTotal: parseFloat(grand_total),
                            subtotal: parseFloat(subtotal),
                            taxTotal: parseFloat(tax_total),
                            paymentMethod: payment_method,
                            items: orderItems,
                            customerId: orders[0].customer_id,
                        });
                    } catch (accErr) {
                        console.error('⚠️ Failed to post mobile delivery to accounting:', accErr);
                    }

                    // Update budget actuals
                    try {
                        const { getBudgetService } = await import('./budgetService.js');
                        const orderItems = await client.query('SELECT product_id, quantity, subtotal FROM mobile_order_items WHERE order_id = $1', [orderId]);
                        await getBudgetService().updateActualsFromOrder(client, tenantId, orders[0].customer_id, orderItems.map((i: any) => ({
                            productId: i.product_id,
                            quantity: i.quantity,
                            subtotal: i.subtotal
                        })));
                    } catch (budgetErr) {
                        console.error('⚠️ Failed to update budget actuals:', budgetErr);
                    }
                }
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

    // ─── Collect Payment (Delivered → Paid) ────────────────────────────

    async collectPayment(tenantId: string, orderId: string, bankAccountId: string, changedBy: string) {
        const orders = await this.db.query(
            'SELECT id, status, payment_status, customer_id, grand_total, order_number FROM mobile_orders WHERE id = $1 AND tenant_id = $2',
            [orderId, tenantId]
        );
        if (orders.length === 0) throw new Error('Order not found');
        const order = orders[0];

        if (order.status !== 'Delivered') {
            throw new Error('Only delivered orders can have payment collected');
        }
        if (order.payment_status === 'Paid') {
            throw new Error('Payment has already been collected for this order');
        }

        // Validate bank account
        const bankRes = await this.db.query(
            'SELECT id, name, account_type FROM shop_bank_accounts WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE',
            [bankAccountId, tenantId]
        );
        if (bankRes.length === 0) throw new Error('Bank account not found or inactive');

        const grandTotal = parseFloat(order.grand_total);

        return this.db.transaction(async (client: any) => {
            // 1. Update payment status
            await client.query(
                `UPDATE mobile_orders SET payment_status = 'Paid', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
                [orderId, tenantId]
            );

            // 2. Update bank account balance
            await client.query(
                `UPDATE shop_bank_accounts SET balance = COALESCE(balance, 0) + $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
                [grandTotal, bankAccountId, tenantId]
            );

            // 3. Post payment accounting: Debit Bank/Cash, Credit Accounts Receivable
            try {
                await this.postMobilePaymentToAccounting(client, orderId, tenantId, {
                    orderNumber: order.order_number,
                    grandTotal,
                    bankAccountId,
                    bankName: bankRes[0].name,
                    bankType: bankRes[0].account_type,
                });
            } catch (accErr) {
                console.error('⚠️ Failed to post mobile payment to accounting:', accErr);
            }

            // 4. Record in status history
            await client.query(
                `INSERT INTO mobile_order_status_history (id, tenant_id, order_id, from_status, to_status, changed_by, changed_by_type, note)
         VALUES ($1, $2, $3, 'Unpaid', 'Paid', $4, 'shop_user', $5)`,
                [generateId('mosh'), tenantId, orderId, changedBy, `Payment collected to ${bankRes[0].name}`]
            );

            return { success: true, orderId, paymentStatus: 'Paid', bankAccountId };
        });
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

        if (status === 'Unpaid') {
            query += ` AND o.status = 'Delivered' AND o.payment_status = 'Unpaid'`;
        } else if (status) {
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

    // ─── Accounting helper: get or create account ──────────────────────

    private async getOrCreateAccount(client: any, tenantId: string, name: string, type: string, code: string): Promise<string> {
        let accRes = await client.query('SELECT id FROM accounts WHERE tenant_id = $1 AND code = $2 LIMIT 1', [tenantId, code]);
        if (accRes.length === 0) {
            accRes = await client.query(
                'INSERT INTO accounts (tenant_id, name, code, type, balance) VALUES ($1, $2, $3, $4, 0) RETURNING id',
                [tenantId, name, code, type]
            );
        }
        return accRes[0].id;
    }

    // ─── Double-entry: Revenue recognition on delivery ──────────────────
    // Debit Accounts Receivable, Credit Revenue; Debit COGS, Credit Inventory

    private async postMobileDeliveryToAccounting(client: any, orderId: string, tenantId: string, data: {
        orderNumber: string;
        grandTotal: number;
        subtotal: number;
        taxTotal: number;
        paymentMethod: string;
        items: any[];
        customerId: string;
    }) {
        const journalRes = await client.query(`
            INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
            VALUES ($1, NOW(), $2, $3, 'MobileApp', $4, 'Posted')
            RETURNING id
        `, [tenantId, data.orderNumber, `Mobile Delivery ${data.orderNumber}`, orderId]);

        if (journalRes.length === 0) return;
        const journalId = journalRes[0].id;

        // 1. Credit Revenue
        const revenueAcc = await this.getOrCreateAccount(client, tenantId, 'Sales Revenue', 'Income', 'INC-400');
        await client.query(
            'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
            [tenantId, journalId, revenueAcc, data.grandTotal]
        );

        // 2. Debit Accounts Receivable (payment collected later)
        const receivableAcc = await this.getOrCreateAccount(client, tenantId, 'Accounts Receivable', 'Asset', 'AST-120');
        await client.query(
            'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
            [tenantId, journalId, receivableAcc, data.grandTotal]
        );

        // 3. COGS vs Inventory
        let totalCogs = 0;
        for (const item of data.items) {
            const prodRes = await client.query('SELECT cost_price FROM shop_products WHERE id = $1 AND tenant_id = $2 LIMIT 1', [item.product_id, tenantId]);
            if (prodRes.length > 0 && prodRes[0].cost_price) {
                totalCogs += (Number(prodRes[0].cost_price) * Number(item.quantity));
            }
        }

        if (totalCogs > 0) {
            const cogsAcc = await this.getOrCreateAccount(client, tenantId, 'Cost of Goods Sold', 'Expense', 'EXP-500');
            const invAssetAcc = await this.getOrCreateAccount(client, tenantId, 'Inventory Asset', 'Asset', 'AST-110');

            await client.query(
                'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
                [tenantId, journalId, cogsAcc, totalCogs]
            );
            await client.query(
                'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
                [tenantId, journalId, invAssetAcc, totalCogs]
            );
        }

        await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
    }

    // ─── Double-entry: Payment collection ───────────────────────────────
    // Debit Cash/Bank, Credit Accounts Receivable

    private async postMobilePaymentToAccounting(client: any, orderId: string, tenantId: string, data: {
        orderNumber: string;
        grandTotal: number;
        bankAccountId: string;
        bankName: string;
        bankType: string;
    }) {
        const journalRes = await client.query(`
            INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
            VALUES ($1, NOW(), $2, $3, 'MobileApp', $4, 'Posted')
            RETURNING id
        `, [tenantId, `PMT-${data.orderNumber}`, `Mobile Payment ${data.orderNumber}`, orderId]);

        if (journalRes.length === 0) return;
        const journalId = journalRes[0].id;

        // 1. Debit Cash/Bank - use linked chart account if available
        const bankLinkRes = await client.query(
            'SELECT chart_account_id FROM shop_bank_accounts WHERE id = $1 AND tenant_id = $2',
            [data.bankAccountId, tenantId]
        );
        let bankChartAccId: string;
        if (bankLinkRes.length > 0 && bankLinkRes[0].chart_account_id) {
            bankChartAccId = bankLinkRes[0].chart_account_id;
        } else {
            const accCode = data.bankType === 'Cash' ? 'AST-100' : 'AST-101';
            bankChartAccId = await this.getOrCreateAccount(client, tenantId, data.bankName, 'Asset', accCode);
        }
        await client.query(
            'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
            [tenantId, journalId, bankChartAccId, data.grandTotal]
        );

        // 2. Credit Accounts Receivable
        const receivableAcc = await this.getOrCreateAccount(client, tenantId, 'Accounts Receivable', 'Asset', 'AST-120');
        await client.query(
            'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
            [tenantId, journalId, receivableAcc, data.grandTotal]
        );

        await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
    }
}

let instance: MobileOrderService | null = null;
export function getMobileOrderService(): MobileOrderService {
    if (!instance) {
        instance = new MobileOrderService();
    }
    return instance;
}
