import { getDatabaseService } from './databaseService.js';
import { getAccountingService } from './accountingService.js';
import { COA } from '../constants/accountCodes.js';
import { fetchUnitCostForProduct } from '../utils/productUnitCost.js';
import { deductInventoryFefo, getSellableQuantityForWarehouse } from './inventoryBatchService.js';
import { aggregateQuantitiesFromOfferLines, prepareOfferBundlesForOrder } from './mobileOfferCheckout.js';

function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function generateOrderNumber(): string {
    const now = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MO-${datePart}-${randPart}`;
}

function safeNum(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
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
    /** Promotional bundles (validated server-side) */
    offerBundles?: { offerId: string; quantity: number }[];
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

        let where = `WHERE p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE AND COALESCE(p.sales_deactivated, FALSE) = FALSE`;

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

        const stockSubquery = `COALESCE((
          SELECT SUM(
            CASE
              WHEN EXISTS (
                SELECT 1 FROM inventory_batches b0
                WHERE b0.tenant_id = $1 AND b0.product_id = i.product_id AND b0.warehouse_id = i.warehouse_id
              )
              THEN GREATEST(0,
                COALESCE((
                  SELECT SUM(b.quantity_remaining)
                  FROM inventory_batches b
                  WHERE b.tenant_id = i.tenant_id AND b.product_id = i.product_id AND b.warehouse_id = i.warehouse_id
                    AND b.quantity_remaining > 0
                    AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
                ), 0) - COALESCE(i.quantity_reserved, 0)
              )
              ELSE GREATEST(COALESCE(i.quantity_on_hand, 0) - COALESCE(i.quantity_reserved, 0), 0)
            END
          )
          FROM shop_inventory i
          WHERE i.tenant_id = $1 AND i.product_id = p.id
        ), 0)`;

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
              COALESCE((
                SELECT SUM(
                  CASE
                    WHEN EXISTS (
                      SELECT 1 FROM inventory_batches b0
                      WHERE b0.tenant_id = $1 AND b0.product_id = i.product_id AND b0.warehouse_id = i.warehouse_id
                    )
                    THEN GREATEST(0,
                      COALESCE((
                        SELECT SUM(b.quantity_remaining)
                        FROM inventory_batches b
                        WHERE b.tenant_id = i.tenant_id AND b.product_id = i.product_id AND b.warehouse_id = i.warehouse_id
                          AND b.quantity_remaining > 0
                          AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
                      ), 0) - COALESCE(i.quantity_reserved, 0)
                    )
                    ELSE GREATEST(COALESCE(i.quantity_on_hand, 0) - COALESCE(i.quantity_reserved, 0), 0)
                  END
                )
                FROM shop_inventory i
                WHERE i.tenant_id = $1 AND i.product_id = p.id
              ), 0) as available_stock
       FROM shop_products p
       LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
       LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = $1
       WHERE p.id = $2 AND p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE AND COALESCE(p.sales_deactivated, FALSE) = FALSE`,
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
                'SELECT id, order_number, status, grand_total FROM mobile_orders WHERE tenant_id = $1 AND idempotency_key = $2',
                [tenantId, input.idempotencyKey]
            );
            if (existing.length > 0) {
                return { order: existing[0], duplicate: true };
            }
        }

        // Shop = branch: use tenant's default (first) branch when not specified, so the app's "shop" is one entity
        let effectiveBranchId: string | null = input.branchId || null;
        if (!effectiveBranchId) {
            const defaultBranch = await this.db.query(
                'SELECT id FROM shop_branches WHERE tenant_id = $1 ORDER BY name ASC LIMIT 1',
                [tenantId]
            );
            if (defaultBranch.length > 0) effectiveBranchId = defaultBranch[0].id;
        }

        const placed = await this.db.transaction(async (client: any) => {
            const regularItems = input.items || [];
            const { merged: offerMerged, flatLines: offerLines } = await prepareOfferBundlesForOrder(
                client,
                tenantId,
                input.customerId,
                input.offerBundles
            );

            const aggOffer = aggregateQuantitiesFromOfferLines(offerLines);
            for (const it of regularItems) {
                if (aggOffer.has(it.productId)) {
                    throw new Error(
                        'A product cannot be in your cart both as a regular item and inside a promotion. Remove one or the other.'
                    );
                }
            }

            const demand = new Map<string, number>();
            for (const it of regularItems) {
                demand.set(it.productId, (demand.get(it.productId) || 0) + Number(it.quantity));
            }
            for (const [pid, q] of aggOffer) {
                demand.set(pid, (demand.get(pid) || 0) + q);
            }
            if (demand.size === 0) {
                throw new Error('Cart is empty');
            }

            // 1. Lock inventory rows for all products in the order
            const productIds = [...demand.keys()];
            const blockedForSale = await client.query(
              `SELECT name FROM shop_products WHERE tenant_id = $1 AND id = ANY($2::text[]) AND COALESCE(sales_deactivated, FALSE) = TRUE`,
              [tenantId, productIds]
            );
            if (blockedForSale.length > 0) {
              const names = blockedForSale.map((r: any) => r.name).join(', ');
              throw new Error(`These products are not available for sale: ${names}.`);
            }

            const invRows = await client.query(
                `SELECT product_id, warehouse_id, quantity_on_hand, quantity_reserved
           FROM shop_inventory
           WHERE tenant_id = $1 AND product_id = ANY($2)
           FOR UPDATE`,
                [tenantId, productIds]
            );

            // 2. Resolve warehouse: use effective branch (shop = branch) so one that has enough stock for ALL items
            let warehouseId: string | null = null;
            if (effectiveBranchId) {
                const whRes = await client.query(
                    'SELECT id FROM shop_warehouses WHERE id = $1 AND tenant_id = $2',
                    [effectiveBranchId, tenantId]
                );
                if (whRes.length > 0) warehouseId = whRes[0].id;
                if (!warehouseId) {
                    throw new Error(
                        'This shop cannot fulfill your order from its current location. Try different items or quantities.'
                    );
                }
            }
            if (!warehouseId) {
                const warehouses = await client.query(
                    'SELECT id FROM shop_warehouses WHERE tenant_id = $1 ORDER BY id',
                    [tenantId]
                );
                for (const wh of warehouses) {
                    const wid = wh.id;
                    let canFulfill = true;
                    for (const [productId, qty] of demand) {
                        const sellable = await getSellableQuantityForWarehouse(client, tenantId, productId, wid);
                        if (sellable < qty) {
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

            const resolvedItems: any[] = [];
            let subtotalGross = 0;
            let discountTotal = 0;
            let taxTotal = 0;

            const validateStock = async (productName: string, productId: string, qty: number) => {
                const productInvRows = invRows.filter((r: any) => r.product_id === productId);
                if (warehouseId) {
                    const availableAtWh = await getSellableQuantityForWarehouse(client, tenantId, productId, warehouseId);
                    if (availableAtWh < qty) {
                        throw new Error(
                            `Insufficient stock for "${productName}" at selected branch. Available at branch: ${Math.max(0, availableAtWh)}, Requested: ${qty}. Try another branch or leave branch unselected.`
                        );
                    }
                    return;
                }
                let totalAvailable = 0;
                for (const r of productInvRows) {
                    totalAvailable += await getSellableQuantityForWarehouse(client, tenantId, productId, r.warehouse_id);
                }
                if (productInvRows.length > 0 && totalAvailable < qty) {
                    throw new Error(
                        `Insufficient stock for "${productName}". Available: ${Math.max(0, Math.round(totalAvailable * 100) / 100)}, Requested: ${qty}`
                    );
                }
            };

            for (const item of regularItems) {
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
                const rawPrice = product.mobile_price != null
                    ? parseFloat(product.mobile_price)
                    : parseFloat(product.retail_price);
                const unitPrice = Number.isFinite(rawPrice) ? rawPrice : 0;
                if (unitPrice <= 0) {
                    throw new Error(
                        `Product "${product.name}" (SKU: ${product.sku}) has no valid price. Set retail price or mobile price in product settings.`
                    );
                }
                const taxRate = parseFloat(product.tax_rate) || 0;
                const qty = Number(item.quantity);
                await validateStock(product.name, item.productId, qty);

                const itemGross = unitPrice * qty;
                const itemTax = Math.round(itemGross * (taxRate / 100) * 100) / 100;

                resolvedItems.push({
                    productId: product.id,
                    productName: product.name,
                    productSku: product.sku,
                    quantity: qty,
                    unitPrice,
                    taxAmount: itemTax,
                    discountAmount: 0,
                    subtotal: Math.round(itemGross * 100) / 100,
                    offerId: null,
                });
                subtotalGross += itemGross;
                taxTotal += itemTax;
            }

            for (const line of offerLines) {
                await validateStock(line.productName, line.productId, line.quantity);
                resolvedItems.push({
                    productId: line.productId,
                    productName: line.productName,
                    productSku: line.productSku,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    taxAmount: line.taxAmount,
                    discountAmount: line.discountAmount,
                    subtotal: line.grossSubtotal,
                    offerId: line.offerId,
                });
                subtotalGross += line.grossSubtotal;
                discountTotal += line.discountAmount;
                taxTotal += line.taxAmount;
            }

            if (!warehouseId && invRows.length > 0) {
                throw new Error(
                    'Insufficient stock at a single location; stock is spread across branches. Please select a branch that has all items in stock.'
                );
            }

            const rawPm = (input.paymentMethod || 'COD').trim();
            const paymentMethod =
                rawPm === 'SelfCollection'
                    ? 'SelfCollection'
                    : rawPm === 'EasypaisaJazzcashOnline'
                      ? 'EasypaisaJazzcashOnline'
                      : 'COD';

            const settingsRes = await client.query(
                'SELECT delivery_fee, free_delivery_above, minimum_order_amount FROM mobile_ordering_settings WHERE tenant_id = $1',
                [tenantId]
            );
            let deliveryFee = 0;
            const netMerchandise = Math.round((subtotalGross - discountTotal) * 100) / 100;
            if (settingsRes.length > 0) {
                const s = settingsRes[0];
                deliveryFee = parseFloat(s.delivery_fee) || 0;
                if (s.free_delivery_above && netMerchandise >= parseFloat(s.free_delivery_above)) {
                    deliveryFee = 0;
                }
                if (s.minimum_order_amount && netMerchandise < parseFloat(s.minimum_order_amount)) {
                    throw new Error(`Minimum order amount is ${s.minimum_order_amount}. Your cart total is ${netMerchandise.toFixed(2)}.`);
                }
            }
            if (paymentMethod === 'SelfCollection') {
                deliveryFee = 0;
            }

            subtotalGross = Math.round(subtotalGross * 100) / 100;
            discountTotal = Math.round(discountTotal * 100) / 100;
            taxTotal = Math.round(taxTotal * 100) / 100;
            const grandTotal = Math.round((subtotalGross - discountTotal + taxTotal + deliveryFee) * 100) / 100;

            const orderId = generateId('mord');
            const orderNumber = generateOrderNumber();

            await client.query(
                `INSERT INTO mobile_orders (
          id, tenant_id, customer_id, branch_id, order_number, status,
          subtotal, tax_total, discount_total, delivery_fee, grand_total,
          payment_method, payment_status,
          delivery_address, delivery_lat, delivery_lng, delivery_notes,
          idempotency_key, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,'Pending',$6,$7,$8,$9,$10,$11,'Unpaid',$12,$13,$14,$15,$16,NOW(),NOW())`,
                [
                    orderId, tenantId, input.customerId, effectiveBranchId,
                    orderNumber, subtotalGross, taxTotal, discountTotal, deliveryFee, grandTotal,
                    paymentMethod,
                    input.deliveryAddress || null, input.deliveryLat || null,
                    input.deliveryLng || null, input.deliveryNotes || null,
                    input.idempotencyKey || null,
                ]
            );

            for (const item of resolvedItems) {
                await client.query(
                    `INSERT INTO mobile_order_items (
            id, tenant_id, order_id, product_id, product_name, product_sku,
            quantity, unit_price, tax_amount, discount_amount, subtotal, offer_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                    [
                        generateId('moi'), tenantId, orderId,
                        item.productId, item.productName, item.productSku,
                        item.quantity, item.unitPrice, item.taxAmount,
                        item.discountAmount, item.subtotal,
                        item.offerId || null,
                    ]
                );

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

            for (const [offerId, qty] of offerMerged) {
                await client.query(
                    `UPDATE offers SET usage_count = usage_count + $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
                    [qty, offerId, tenantId]
                );
                await client.query(
                    `INSERT INTO mobile_customer_offer_usage (id, tenant_id, customer_id, offer_id, usage_count, updated_at)
           VALUES ($1,$2,$3,$4,$5,NOW())
           ON CONFLICT (tenant_id, customer_id, offer_id) DO UPDATE SET
             usage_count = mobile_customer_offer_usage.usage_count + EXCLUDED.usage_count,
             updated_at = NOW()`,
                    [generateId('mcou'), tenantId, input.customerId, offerId, qty]
                );
            }

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
                    subtotal: subtotalGross,
                    tax_total: taxTotal,
                    discount_total: discountTotal,
                    delivery_fee: deliveryFee,
                    grand_total: grandTotal,
                    items: resolvedItems,
                },
                duplicate: false,
            };
        });

        // First order for this mobile customer: ensure loyalty member (covers legacy users who registered before enrollment existed)
        if (placed && !placed.duplicate && placed.order) {
            try {
                const custRows = await this.db.query(
                    'SELECT phone, name, email FROM mobile_customers WHERE id = $1 AND tenant_id = $2',
                    [input.customerId, tenantId]
                );
                if (custRows.length > 0) {
                    const cntRows = await this.db.query(
                        'SELECT COUNT(*)::int AS c FROM mobile_orders WHERE tenant_id = $1 AND customer_id = $2',
                        [tenantId, input.customerId]
                    );
                    const orderCount = Number(cntRows[0]?.c) || 0;
                    if (orderCount === 1) {
                        const { getShopService } = await import('./shopService.js');
                        await getShopService().ensureLoyaltyMemberForMobileUser(tenantId, {
                            phone: custRows[0].phone,
                            name: custRows[0].name,
                            email: custRows[0].email ?? null,
                        });
                    }
                }
            } catch (_loyaltyErr) {
                // best-effort; order already placed
            }
        }

        const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
        notifyDailyReportUpdated(tenantId).catch(() => {});
        return placed;
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
       LEFT JOIN mobile_customers mc ON o.customer_id = mc.id AND mc.tenant_id = $2
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

        const order = orders[0];
        const normalizedItems = (items as any[]).map((i: any) => ({
            ...i,
            unit_price: safeNum(i.unit_price),
            subtotal: safeNum(i.subtotal),
            tax_amount: safeNum(i.tax_amount),
            discount_amount: safeNum(i.discount_amount),
            unit_cost_at_sale: i.unit_cost_at_sale != null && i.unit_cost_at_sale !== '' ? safeNum(i.unit_cost_at_sale) : null,
        }));
        let subtotal = safeNum(order.subtotal);
        let tax_total = safeNum(order.tax_total);
        let delivery_fee = safeNum(order.delivery_fee);
        let grand_total = safeNum(order.grand_total);
        if (!Number.isFinite(Number(order.subtotal)) || !Number.isFinite(Number(order.grand_total))) {
            subtotal = normalizedItems.reduce((sum, i) => sum + i.subtotal, 0);
            tax_total = safeNum(order.tax_total) || normalizedItems.reduce((sum, i) => sum + i.tax_amount, 0);
            grand_total = Math.round((subtotal + tax_total + delivery_fee) * 100) / 100;
        }
        return {
            ...order,
            subtotal,
            tax_total,
            discount_total: safeNum(order.discount_total),
            delivery_fee,
            grand_total,
            items: normalizedItems,
            status_history: history,
        };
    }

    // ─── Status Updates (POS side) ─────────────────────────────────────

    async updateOrderStatus(tenantId: string, orderId: string, newStatus: string, changedBy: string, changedByType: string = 'shop_user', note?: string) {
        if (!VALID_STATUSES.includes(newStatus as OrderStatus)) {
            throw new Error(`Invalid status: ${newStatus}. Valid: ${VALID_STATUSES.join(', ')}`);
        }

        const orders = await this.db.query(
            'SELECT id, status, customer_id, payment_method FROM mobile_orders WHERE id = $1 AND tenant_id = $2',
            [orderId, tenantId]
        );
        if (orders.length === 0) throw new Error('Order not found');

        const currentStatus = orders[0].status;
        const paymentMethod = orders[0].payment_method || 'COD';

        let allowed = [...(VALID_TRANSITIONS[currentStatus] || [])];
        if (currentStatus === 'Packed' && paymentMethod === 'SelfCollection') {
            allowed.push('Delivered');
        }
        if (!allowed.includes(newStatus)) {
            throw new Error(`Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none (terminal state)'}`);
        }

        const result = await this.db.transaction(async (client: any) => {
            // Update order
            const updateFields: string[] = [`status = $1`, `updated_at = NOW()`];
            const updateParams: any[] = [newStatus];
            let pIdx = 2;

            if (newStatus === 'Delivered') {
                updateFields.push(`delivered_at = NOW()`);
                // payment_status stays 'Unpaid' — payment is collected separately via collectPayment()

                const orderData = await client.query('SELECT grand_total, payment_method, order_number, subtotal, tax_total FROM mobile_orders WHERE id = $1 AND tenant_id = $2', [orderId, tenantId]);
                if (orderData.length > 0) {
                    const { grand_total, order_number, subtotal, tax_total, payment_method } = orderData[0];

                    // Revenue recognition: Debit Accounts Receivable, Credit Revenue + COGS entries
                    try {
                        await this.postMobileDeliveryToAccounting(client, orderId, tenantId, {
                            orderNumber: order_number,
                            grandTotal: parseFloat(grand_total),
                            subtotal: parseFloat(subtotal),
                            taxTotal: parseFloat(tax_total),
                            paymentMethod: payment_method,
                            customerId: orders[0].customer_id,
                        });
                    } catch (accErr) {
                        console.error('⚠️ Failed to post mobile delivery to accounting:', accErr);
                    }

                    // Update budget actuals
                    try {
                        const { getBudgetService } = await import('./budgetService.js');
                        const orderItems = await client.query('SELECT product_id, quantity, subtotal FROM mobile_order_items WHERE order_id = $1 AND tenant_id = $2', [orderId, tenantId]);
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
        const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
        notifyDailyReportUpdated(tenantId).catch(() => {});
        return result;
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
                const fefo = await deductInventoryFefo(
                    client,
                    tenantId,
                    item.product_id,
                    warehouseId,
                    qty,
                    orderId
                );
                const unitCostAtConfirm = await fetchUnitCostForProduct(client, tenantId, item.product_id);
                let unitCost =
                    fefo.weightedUnitCost != null && fefo.weightedUnitCost > 0
                        ? fefo.weightedUnitCost
                        : unitCostAtConfirm > 0
                          ? unitCostAtConfirm
                          : null;
                const totalCost = unitCost != null ? unitCost * qty : null;
                await client.query(
                    `UPDATE shop_inventory
           SET quantity_reserved = GREATEST(quantity_reserved - $1, 0),
               updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3 AND tenant_id = $4`,
                    [qty, item.product_id, warehouseId, tenantId]
                );
                await client.query(
                    `INSERT INTO shop_inventory_movements (id, tenant_id, product_id, warehouse_id, type, quantity, reference_id, reason, unit_cost, total_cost)
           VALUES ($1, $2, $3, $4, 'MobileSale', $5, $6, 'Mobile order confirmed', $7, $8)`,
                    [generateId('im'), tenantId, item.product_id, warehouseId, -qty, orderId, unitCost, totalCost]
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
      LEFT JOIN mobile_customers mc ON o.customer_id = mc.id AND mc.tenant_id = $1
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
        const rows = await this.db.query(query, params);
        return (rows as any[]).map((o: any) => ({
            ...o,
            subtotal: safeNum(o.subtotal),
            tax_total: safeNum(o.tax_total),
            discount_total: safeNum(o.discount_total),
            delivery_fee: safeNum(o.delivery_fee),
            grand_total: safeNum(o.grand_total),
        }));
    }

    async getUnsyncedOrders(tenantId: string) {
        return this.db.query(
            `SELECT o.*, mc.phone as customer_phone, mc.name as customer_name
       FROM mobile_orders o
       LEFT JOIN mobile_customers mc ON o.customer_id = mc.id AND mc.tenant_id = $1
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

    private async getAcc(
        client: any,
        tenantId: string,
        code: string,
        name: string,
        type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
    ): Promise<string> {
        return getAccountingService().getOrCreateAccountByCode(tenantId, code, name, type, client);
    }

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
        customerId: string;
    }) {
        const journalRes = await client.query(`
            INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
            VALUES ($1, NOW(), $2, $3, 'MobileApp', $4, 'Posted')
            RETURNING id
        `, [tenantId, data.orderNumber, `Mobile Delivery ${data.orderNumber}`, orderId]);

        if (journalRes.length === 0) return;
        const journalId = journalRes[0].id;

        // 1. Credit Revenue (41001 Retail Sales)
        const revenueAcc = await this.getAcc(client, tenantId, COA.RETAIL_SALES, 'Retail Sales', 'Income');
        await client.query(
            'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
            [tenantId, journalId, revenueAcc, data.grandTotal]
        );

        // 2. Debit Accounts Receivable (11201 Trade Receivables)
        const receivableAcc = await this.getAcc(client, tenantId, COA.TRADE_RECEIVABLES, 'Trade Receivables', 'Asset');
        await client.query(
            'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
            [tenantId, journalId, receivableAcc, data.grandTotal]
        );

        // 3. COGS vs Inventory (51001, 11301) — snapshot unit cost on each line at delivery (immutable vs later product edits)
        let totalCogs = 0;
        const orderLines = await client.query(
            'SELECT id, product_id, quantity FROM mobile_order_items WHERE order_id = $1 AND tenant_id = $2',
            [orderId, tenantId]
        );
        for (const line of orderLines) {
            const uc = await fetchUnitCostForProduct(client, tenantId, line.product_id);
            await client.query(
                'UPDATE mobile_order_items SET unit_cost_at_sale = $1 WHERE id = $2 AND tenant_id = $3',
                [uc > 0 ? uc : null, line.id, tenantId]
            );
            if (uc > 0) totalCogs += uc * Number(line.quantity);
        }

        if (totalCogs > 0) {
            const cogsAcc = await this.getAcc(client, tenantId, COA.COST_OF_GOODS_SOLD, 'Cost of Goods Sold', 'Expense');
            const invAssetAcc = await this.getAcc(client, tenantId, COA.MERCHANDISE_INVENTORY, 'Merchandise Inventory', 'Asset');

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
            const accCode = data.bankType === 'Cash' ? COA.CASH_ON_HAND : COA.MAIN_BANK;
            bankChartAccId = await this.getAcc(client, tenantId, accCode, data.bankName, 'Asset');
        }
        await client.query(
            'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
            [tenantId, journalId, bankChartAccId, data.grandTotal]
        );

        // 2. Credit Accounts Receivable (11201)
        const receivableAcc = await this.getAcc(client, tenantId, COA.TRADE_RECEIVABLES, 'Trade Receivables', 'Asset');
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
