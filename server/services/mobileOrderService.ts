import { getDatabaseService } from './databaseService.js';
import { getAccountingService } from './accountingService.js';
import { COA } from '../constants/accountCodes.js';
import { fetchUnitCostForProduct } from '../utils/productUnitCost.js';
import { deductInventoryFefo, getSellableQuantityForWarehouse } from './inventoryBatchService.js';
import { aggregateQuantitiesFromOfferLines, prepareOfferBundlesForOrder } from './mobileOfferCheckout.js';
import { getWarehouseIdForMobileOrder, resolveBranchWarehouseForPlaceOrder } from './mobileOrderBranchRouting.js';
import { invalidateInventorySkuListCache } from './shopService.js';
import { tryAutoAssignRiderForMobileOrder, manuallyAssignRiderForMobileOrder } from './deliveryAssignment.js';
import { haversineDistanceKm } from '../utils/haversine.js';
import { getDrivingDurationSeconds } from './googleDirectionsEtaService.js';

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

const RECOMMENDATION_STOP_WORDS = new Set([
    'and',
    'are',
    'for',
    'from',
    'the',
    'this',
    'that',
    'with',
    'your',
    'pack',
    'pcs',
    'piece',
    'pieces',
    'gram',
    'grams',
    'kg',
    'liter',
    'litre',
    'ml',
]);

function getRecommendationKeywords(...parts: Array<string | null | undefined>): string[] {
    const text = parts.filter(Boolean).join(' ').toLowerCase();
    const seen = new Set<string>();
    const words = text.match(/[a-z0-9]+/g) ?? [];
    for (const word of words) {
        if (word.length < 3 || RECOMMENDATION_STOP_WORDS.has(word)) continue;
        seen.add(word);
        if (seen.size >= 8) break;
    }
    return Array.from(seen);
}

function parseAttributesJson(val: any): Record<string, unknown> | null {
    if (val == null) return null;
    if (typeof val === 'object' && !Array.isArray(val)) {
        const o = val as Record<string, unknown>;
        return Object.keys(o).length > 0 ? o : null;
    }
    if (typeof val === 'string') {
        try {
            const j = JSON.parse(val);
            if (j && typeof j === 'object' && !Array.isArray(j)) {
                const o = j as Record<string, unknown>;
                return Object.keys(o).length > 0 ? o : null;
            }
        } catch {
            return null;
        }
    }
    return null;
}

/** Sellable qty expression for mobile catalog (tenant param is always $1). */
function mobileProductSellableStockSql(): string {
    return `COALESCE((
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
}

/** Stage 8 (POS) / Stage 9 (customer PWA); Stages 10–11 SSE use NOTIFY — distance still from rider GPS when coords exist. */
function enrichOrderWithRiderToDropoff(o: Record<string, unknown>): Record<string, unknown> {
    const dlat = o.delivery_lat != null ? parseFloat(String(o.delivery_lat)) : NaN;
    const dlng = o.delivery_lng != null ? parseFloat(String(o.delivery_lng)) : NaN;
    const rlat = o.rider_latitude != null ? parseFloat(String(o.rider_latitude)) : NaN;
    const rlng = o.rider_longitude != null ? parseFloat(String(o.rider_longitude)) : NaN;
    let rider_to_dropoff_km: number | null = null;
    if (Number.isFinite(dlat) && Number.isFinite(dlng) && Number.isFinite(rlat) && Number.isFinite(rlng)) {
        rider_to_dropoff_km = Math.round(haversineDistanceKm(rlat, rlng, dlat, dlng) * 10000) / 10000;
    }
    return { ...o, rider_to_dropoff_km };
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
        /** 1-based page; when set, uses OFFSET and ignores cursor (use with showUnavailable or any full-list paging). */
        page?: number;
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
        /** When false (default), exclude zero-stock items unless pre-order. */
        showUnavailable?: boolean;
        filterInStock?: boolean;
        filterPopular?: boolean;
        filterLowPrice?: boolean;
        /** Upper bound for "Low Price" chip (default 500). */
        lowPriceMax?: number;
    } = {}) {
        const LOW_STOCK_THRESHOLD = 5;
        const DEFAULT_LOW_PRICE_MAX = 500;
        const limit = Math.min(opts.limit || 20, 50);
        const params: any[] = [tenantId];
        let paramIdx = 2;

        let where = `WHERE p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE AND COALESCE(p.sales_deactivated, FALSE) = FALSE
            AND COALESCE(p.mobile_price, p.retail_price) > 0`;

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
            // Match brand_id (normal) or legacy rows with only free-text `brand` matching shop_brands name
            where += ` AND (
                p.brand_id = ANY($${paramIdx})
                OR (
                    p.brand_id IS NULL
                    AND NULLIF(TRIM(p.brand), '') IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM shop_brands b_filter
                        WHERE b_filter.tenant_id = $1
                          AND b_filter.id = ANY($${paramIdx})
                          AND LOWER(TRIM(b_filter.name)) = LOWER(TRIM(p.brand))
                    )
                )
            )`;
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

        const stockSubquery = mobileProductSellableStockSql();

        const showUnavailable = opts.showUnavailable === true;
        /** Explicit "out of stock" filter must not be combined with the default hide-OOS rule (would yield no rows). */
        const hideOosByDefault = !showUnavailable && opts.availability !== 'out_of_stock';
        if (hideOosByDefault) {
            where += ` AND (${stockSubquery} > 0 OR COALESCE(p.is_pre_order, FALSE) = TRUE)`;
        }

        if (opts.filterInStock) {
            where += ` AND ${stockSubquery} > 0`;
        }

        if (opts.filterPopular) {
            where += ` AND (COALESCE(p.popularity_score, 0) > 0 OR COALESCE(p.total_sales, 0) > 0)`;
        }

        if (opts.filterLowPrice) {
            const cap =
                opts.lowPriceMax != null && Number.isFinite(opts.lowPriceMax)
                    ? opts.lowPriceMax
                    : DEFAULT_LOW_PRICE_MAX;
            where += ` AND COALESCE(p.mobile_price, p.retail_price) <= $${paramIdx}`;
            params.push(cap);
            paramIdx++;
        }

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

        const oosOrderExpr = `(CASE WHEN (${stockSubquery}) <= 0 AND NOT COALESCE(p.is_pre_order, FALSE) THEN 1 ELSE 0 END)`;
        if (showUnavailable) {
            orderBy = `${oosOrderExpr} ASC, ${orderBy}`;
        }

        const usePage = opts.page != null && opts.page > 0;
        const useCursor = !usePage && Boolean(opts.cursor) && !showUnavailable;

        if (useCursor && opts.cursor) {
            try {
                const decoded = Buffer.from(opts.cursor, 'base64').toString('utf-8');
                const [cValue, cId] = decoded.split('|');
                if (opts.sortBy?.startsWith('price')) {
                    const op = opts.sortBy === 'price_low_high' ? '>' : '<';
                    where += ` AND (COALESCE(p.mobile_price, p.retail_price), p.id) ${op} ($${paramIdx}, $${paramIdx + 1})`;
                } else {
                    where += ` AND (p.created_at, p.id) < ($${paramIdx}, $${paramIdx + 1})`;
                }
                params.push(cValue, cId);
                paramIdx += 2;
            } catch { /* ignore bad cursor */ }
        }

        let limitSql = `LIMIT $${paramIdx}`;
        params.push(limit + 1);
        paramIdx++;

        if (usePage) {
            limitSql += ` OFFSET $${paramIdx}`;
            params.push((opts.page! - 1) * limit);
            paramIdx++;
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
      ${limitSql}
    `;

        const rows = await this.db.query(query, params);
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit).map((r: any) => {
            const stock = parseFloat(r.available_stock) || 0;
            const isPre = Boolean(r.is_pre_order);
            return {
                ...r,
                price: r.mobile_price != null ? (parseFloat(r.mobile_price) || 0) : (parseFloat(r.retail_price) || 0),
                available_stock: stock,
                stock,
                image: r.image_url,
                is_low_stock: stock > 0 && stock <= LOW_STOCK_THRESHOLD,
                is_out_of_stock: stock <= 0 && !isPre,
                rating_avg: parseFloat(r.rating_avg) || 0,
            };
        });

        let nextCursor: string | null = null;
        if (!usePage && hasMore && items.length > 0) {
            const last = items[items.length - 1];
            const cursorVal = opts.sortBy?.startsWith('price')
                ? last.price
                : (last.created_at instanceof Date ? last.created_at.toISOString() : new Date(last.created_at).toISOString());
            nextCursor = Buffer.from(`${cursorVal}|${last.id}`).toString('base64');
        }

        return {
            items,
            nextCursor,
            hasMore,
            page: usePage ? opts.page : undefined,
            nextPage: usePage && hasMore ? (opts.page! + 1) : undefined,
        };
    }

    async getProductDetailForMobile(tenantId: string, productId: string) {
        const stockExpr = mobileProductSellableStockSql();
        const rows = await this.db.query(
            `SELECT p.*, c.name as category_name, b.name as brand_name,
              ${stockExpr} as available_stock
       FROM shop_products p
       LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
       LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = $1
       WHERE p.id = $2 AND p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE AND COALESCE(p.sales_deactivated, FALSE) = FALSE
         AND COALESCE(p.mobile_price, p.retail_price) > 0`,
            [tenantId, productId]
        );
        if (rows.length === 0) return null;
        const r = rows[0];
        const stockNum = safeNum(r.available_stock);
        const attrs = parseAttributesJson((r as any).attributes);
        const brandCol = (r as any).brand != null && String((r as any).brand).trim() ? String((r as any).brand).trim() : '';
        const brandJoin = (r as any).brand_name != null && String((r as any).brand_name).trim() ? String((r as any).brand_name).trim() : '';
        const brandDisplay = brandCol || brandJoin || null;
        const rawW = (r as any).weight;
        const weightNum =
            rawW === null || rawW === undefined || rawW === ''
                ? null
                : (() => {
                      const n = typeof rawW === 'number' ? rawW : parseFloat(String(rawW));
                      return Number.isFinite(n) ? n : null;
                  })();

        return {
            id: r.id,
            name: r.name,
            sku: r.sku,
            sku_code: r.sku,
            barcode: r.barcode ?? null,
            brand: brandDisplay,
            unit: r.unit ?? null,
            weight: weightNum,
            weight_unit: (r as any).weight_unit ?? null,
            size: (r as any).size ?? null,
            color: (r as any).color ?? null,
            material: (r as any).material ?? null,
            origin_country: (r as any).origin_country ?? null,
            attributes: attrs,
            price: r.mobile_price != null ? parseFloat(r.mobile_price) : parseFloat(r.retail_price),
            retail_price: parseFloat(r.retail_price),
            mobile_price: r.mobile_price != null ? parseFloat(r.mobile_price) : null,
            tax_rate: r.tax_rate,
            image_url: r.image_url ?? null,
            category_id: r.category_id ?? null,
            category_name: r.category_name ?? null,
            available_stock: stockNum,
            stock: stockNum,
            description: r.mobile_description ?? (r as any).description ?? null,
            mobile_description: r.mobile_description ?? null,
            is_on_sale: r.is_on_sale,
            is_pre_order: r.is_pre_order,
            discount_percentage: r.discount_percentage,
            rating_avg: parseFloat(r.rating_avg) || 0,
            rating_count: r.rating_count,
        };
    }

    /**
     * Recommendations: rank same-category products first, then fill with related cross-category
     * products using brand/unit/name/category keyword matches, and finally popular sellable items.
     */
    async getProductRecommendationsForMobile(tenantId: string, productId: string, limit = 6) {
        const stockSubquery = mobileProductSellableStockSql();
        const meta = await this.db.query(
            `SELECT p.category_id, p.subcategory_id, p.brand_id, p.name, p.mobile_description, p.unit,
                    COALESCE(p.mobile_price, p.retail_price) as price,
                    c.name as category_name,
                    COALESCE(NULLIF(p.brand, ''), b.name) as brand_name
       FROM shop_products p
       LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
       LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = $1
       WHERE p.tenant_id = $1
         AND p.id = $2
         AND p.is_active = TRUE
         AND p.mobile_visible = TRUE
         AND COALESCE(p.sales_deactivated, FALSE) = FALSE`,
            [tenantId, productId]
        );
        if (meta.length === 0) return [];

        const categoryId = meta[0]?.category_id ?? null;
        const subcategoryId = meta[0]?.subcategory_id ?? null;
        const brandId = meta[0]?.brand_id ?? null;
        const unit = meta[0]?.unit ?? null;
        const currentPrice = safeNum(meta[0]?.price);
        const keywords = getRecommendationKeywords(
            meta[0]?.name,
            meta[0]?.mobile_description,
            meta[0]?.category_name,
            meta[0]?.brand_name,
            unit
        );
        const safeLimit = Math.min(Math.max(limit, 6), 12);
        const poolSize = Math.min(60, Math.max(safeLimit * 8, 24));

        const relatedQuery = `
      WITH scored AS (
        SELECT p.id, p.name, p.sku, p.category_id, p.subcategory_id, p.brand_id,
               p.unit, p.retail_price, p.tax_rate, p.image_url,
               p.mobile_price, p.mobile_description, p.is_on_sale, p.is_pre_order, p.discount_percentage,
               p.rating_avg, p.rating_count, p.total_sales, p.popularity_score,
               c.name as category_name,
               COALESCE(NULLIF(p.brand, ''), b.name) as brand_name,
               ${stockSubquery} as available_stock,
               (
                 CASE WHEN $3::text IS NOT NULL AND p.subcategory_id::text = $3 THEN 100 ELSE 0 END +
                 CASE WHEN $4::text IS NOT NULL AND p.category_id::text = $4 THEN 75 ELSE 0 END +
                 CASE WHEN $5::text IS NOT NULL AND p.brand_id::text = $5 THEN 35 ELSE 0 END +
                 CASE WHEN $6::text IS NOT NULL AND LOWER(COALESCE(p.unit, '')) = LOWER($6) THEN 10 ELSE 0 END +
                 LEAST((
                   SELECT COUNT(*)::int
                   FROM unnest($8::text[]) kw
                   WHERE p.name ILIKE '%' || kw || '%'
                      OR COALESCE(p.mobile_description, '') ILIKE '%' || kw || '%'
                      OR COALESCE(c.name, '') ILIKE '%' || kw || '%'
                      OR COALESCE(p.brand, b.name, '') ILIKE '%' || kw || '%'
                 ) * 12, 48) +
                 CASE
                   WHEN $7::numeric > 0 THEN GREATEST(0, 12 - LEAST(12, ABS(COALESCE(p.mobile_price, p.retail_price) - $7::numeric) / $7::numeric * 12))
                   ELSE 0
                 END +
                 LEAST(COALESCE(p.total_sales, 0), 20) * 0.25 +
                 LEAST(COALESCE(p.popularity_score, 0), 20) * 0.25
               ) as relevance_score
        FROM shop_products p
        LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
        LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = $1
        WHERE p.tenant_id = $1
          AND p.is_active = TRUE
          AND p.mobile_visible = TRUE
          AND COALESCE(p.sales_deactivated, FALSE) = FALSE
          AND COALESCE(p.mobile_price, p.retail_price) > 0
          AND p.id::text != $2
          AND (${stockSubquery} > 0 OR COALESCE(p.is_pre_order, FALSE) = TRUE)
      )
      SELECT *
      FROM scored
      WHERE relevance_score > 0
      ORDER BY relevance_score DESC, COALESCE(total_sales, 0) DESC, COALESCE(rating_avg, 0) DESC, RANDOM()
      LIMIT $9
    `;

        let rows = await this.db.query(relatedQuery, [
            tenantId,
            productId,
            subcategoryId ? String(subcategoryId) : null,
            categoryId ? String(categoryId) : null,
            brandId ? String(brandId) : null,
            unit,
            currentPrice,
            keywords,
            poolSize,
        ]);

        if (rows.length < safeLimit) {
            const seenIds = [productId, ...rows.map((r: any) => String(r.id))];
            const fallbackRows = await this.db.query(
                `
      SELECT p.id, p.name, p.sku, p.category_id, p.subcategory_id, p.brand_id,
             p.unit, p.retail_price, p.tax_rate, p.image_url,
             p.mobile_price, p.mobile_description, p.is_on_sale, p.is_pre_order, p.discount_percentage,
             p.rating_avg, p.rating_count,
             c.name as category_name,
             COALESCE(NULLIF(p.brand, ''), b.name) as brand_name,
             ${stockSubquery} as available_stock
      FROM shop_products p
      LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = $1
      LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = $1
      WHERE p.tenant_id = $1
        AND p.is_active = TRUE
        AND p.mobile_visible = TRUE
        AND COALESCE(p.sales_deactivated, FALSE) = FALSE
        AND COALESCE(p.mobile_price, p.retail_price) > 0
        AND NOT (p.id::text = ANY($2::text[]))
        AND (${stockSubquery} > 0 OR COALESCE(p.is_pre_order, FALSE) = TRUE)
      ORDER BY COALESCE(p.total_sales, 0) DESC, COALESCE(p.popularity_score, 0) DESC, COALESCE(p.rating_avg, 0) DESC, RANDOM()
      LIMIT $3
    `,
                [tenantId, seenIds, safeLimit - rows.length]
            );
            rows = rows.concat(fallbackRows);
        }

        rows = rows.slice(0, safeLimit);
        const LOW_STOCK_THRESHOLD = 5;
        return rows.map((row: any) => {
            const stock = parseFloat(row.available_stock) || 0;
            const isPre = Boolean(row.is_pre_order);
            return {
                ...row,
                price: row.mobile_price != null ? (parseFloat(row.mobile_price) || 0) : (parseFloat(row.retail_price) || 0),
                available_stock: stock,
                stock,
                image: row.image_url,
                is_low_stock: stock > 0 && stock <= LOW_STOCK_THRESHOLD,
                is_out_of_stock: stock <= 0 && !isPre,
                rating_avg: parseFloat(row.rating_avg) || 0,
            };
        });
    }

    async getCategoriesForMobile(tenantId: string) {
        const stockExpr = mobileProductSellableStockSql();
        const categories = await this.db.query(
            `SELECT c.id, c.name, c.parent_id, c.mobile_icon_url,
        (
          SELECT COUNT(*)::int
          FROM shop_products p
          WHERE p.tenant_id = $1
            AND p.category_id = c.id
            AND p.is_active = TRUE
            AND p.mobile_visible = TRUE
            AND COALESCE(p.sales_deactivated, FALSE) = FALSE
            AND COALESCE(p.mobile_price, p.retail_price) > 0
            AND ((${stockExpr}) > 0 OR COALESCE(p.is_pre_order, FALSE) = TRUE)
        ) AS product_count
       FROM categories c
       WHERE c.tenant_id = $1 AND c.type = 'product' AND c.deleted_at IS NULL
       ORDER BY c.name ASC`,
            [tenantId]
        );

        // Return flat but with parent_id so mobile can structure them; product_count = sellable/published items (same rules as default mobile catalog)
        return categories;
    }

    async getBrandsForMobile(tenantId: string) {
        return this.db.query(
            `SELECT id, name, logo_url
           FROM shop_brands
           WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
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

            // 2. Resolve branch + warehouse (Stage 3: Haversine nearest fulfillable when delivery + customer coords)
            const routed = await resolveBranchWarehouseForPlaceOrder(client, tenantId, input, demand);
            const effectiveBranchId = routed.effectiveBranchId;
            const warehouseId = routed.warehouseId;
            const assignedBranchId = routed.assignedBranchId;
            const distanceKm = routed.distanceKm;

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
                'SELECT delivery_fee, free_delivery_above, minimum_order_amount, rider_assignment_mode FROM mobile_ordering_settings WHERE tenant_id = $1',
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
          assigned_branch_id, distance_km,
          idempotency_key, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,'Pending',$6,$7,$8,$9,$10,$11,'Unpaid',$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())`,
                [
                    orderId, tenantId, input.customerId, effectiveBranchId,
                    orderNumber, subtotalGross, taxTotal, discountTotal, deliveryFee, grandTotal,
                    paymentMethod,
                    input.deliveryAddress || null, input.deliveryLat || null,
                    input.deliveryLng || null, input.deliveryNotes || null,
                    assignedBranchId,
                    distanceKm != null && Number.isFinite(distanceKm) ? Math.round(distanceKm * 10000) / 10000 : null,
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

            let deliveryAssign: {
                riderId: string;
                riderDistanceKm: number | null;
                deliveryOrderId: string;
            } | null = null;
            if (paymentMethod !== 'SelfCollection') {
                const riderMode = settingsRes.length > 0 ? (settingsRes[0].rider_assignment_mode || 'auto') : 'auto';
                if (riderMode === 'auto') {
                    deliveryAssign = await tryAutoAssignRiderForMobileOrder(client, tenantId, orderId, {
                        deliveryLat: input.deliveryLat,
                        deliveryLng: input.deliveryLng,
                        assignedBranchId: assignedBranchId ?? effectiveBranchId,
                    });
                }
            }

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
                    branch_id: effectiveBranchId,
                    assigned_branch_id: assignedBranchId,
                    distance_km: distanceKm != null && Number.isFinite(distanceKm) ? Math.round(distanceKm * 10000) / 10000 : null,
                    ...(deliveryAssign
                        ? {
                              rider_id: deliveryAssign.riderId,
                              delivery_order_id: deliveryAssign.deliveryOrderId,
                              rider_distance_km: deliveryAssign.riderDistanceKm,
                          }
                        : {}),
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

    /** Customer order history; Stage 9 includes courier summary for list UI. */
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
              o.payment_status, o.delivery_address, o.created_at, o.updated_at,
              d.id AS delivery_order_id, d.status AS delivery_status,
              r.name AS rider_name
       FROM mobile_orders o
       LEFT JOIN delivery_orders d ON d.order_id = o.id AND d.tenant_id = o.tenant_id
       LEFT JOIN riders r ON r.id = d.rider_id AND r.tenant_id = o.tenant_id
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
            `SELECT o.*, mc.phone as customer_phone, mc.name as customer_name,
              d.id AS delivery_order_id, d.status AS delivery_status,
              r.id AS rider_id, r.name AS rider_name, r.phone_number AS rider_phone,
              r.current_latitude AS rider_latitude, r.current_longitude AS rider_longitude,
              r.status AS rider_operational_status,
              ab.name AS assigned_branch_name,
              COALESCE(
                (SELECT mobile_customer_verified FROM shop_loyalty_members
                 WHERE id = o.loyalty_member_id AND tenant_id = o.tenant_id LIMIT 1),
                (SELECT lm.mobile_customer_verified
                 FROM mobile_customers mc2
                 INNER JOIN contacts c ON c.tenant_id = mc2.tenant_id
                   AND regexp_replace(COALESCE(mc2.phone, ''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(c.contact_no, ''), '[^0-9]', '', 'g')
                   AND length(regexp_replace(COALESCE(mc2.phone, ''), '[^0-9]', '', 'g')) > 0
                 INNER JOIN shop_loyalty_members lm ON lm.customer_id = c.id AND lm.tenant_id = c.tenant_id
                 WHERE mc2.id = o.customer_id AND mc2.tenant_id = o.tenant_id
                 LIMIT 1),
                FALSE
              ) AS customer_mobile_verified,
              mc.email AS customer_email,
              (SELECT COUNT(*)::int FROM mobile_orders mo_c
               WHERE mo_c.customer_id = o.customer_id AND mo_c.tenant_id = o.tenant_id) AS customer_order_count,
              COALESCE(
                (SELECT lm.tier FROM shop_loyalty_members lm
                 WHERE lm.id = o.loyalty_member_id AND lm.tenant_id = o.tenant_id LIMIT 1),
                (SELECT lm.tier
                 FROM mobile_customers mc2
                 INNER JOIN contacts c ON c.tenant_id = mc2.tenant_id
                   AND regexp_replace(COALESCE(mc2.phone, ''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(c.contact_no, ''), '[^0-9]', '', 'g')
                   AND length(regexp_replace(COALESCE(mc2.phone, ''), '[^0-9]', '', 'g')) > 0
                 INNER JOIN shop_loyalty_members lm ON lm.customer_id = c.id AND lm.tenant_id = c.tenant_id
                 WHERE mc2.id = o.customer_id AND mc2.tenant_id = o.tenant_id
                 LIMIT 1),
                NULL
              ) AS customer_loyalty_tier
       FROM mobile_orders o
       LEFT JOIN mobile_customers mc ON o.customer_id = mc.id AND mc.tenant_id = $2
       LEFT JOIN delivery_orders d ON d.order_id = o.id AND d.tenant_id = o.tenant_id
       LEFT JOIN riders r ON r.id = d.rider_id AND r.tenant_id = o.tenant_id
       LEFT JOIN shop_branches ab ON ab.id = o.assigned_branch_id AND ab.tenant_id = o.tenant_id
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
        return enrichOrderWithRiderToDropoff({
            ...order,
            subtotal,
            tax_total,
            discount_total: safeNum(order.discount_total),
            delivery_fee,
            grand_total,
            items: normalizedItems,
            status_history: history,
        }) as any;
    }

    /** Driving ETA for customer track screen (Google Directions; server-side key). */
    async getDeliveryEtaForCustomerOrder(tenantId: string, orderId: string, customerId: string) {
        const rows = await this.db.query(
            `SELECT o.customer_id, o.payment_method, o.status,
              o.delivery_lat, o.delivery_lng,
              r.current_latitude AS rider_lat, r.current_longitude AS rider_lng
       FROM mobile_orders o
       LEFT JOIN delivery_orders d ON d.order_id = o.id AND d.tenant_id = o.tenant_id
       LEFT JOIN riders r ON r.id = d.rider_id AND r.tenant_id = o.tenant_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
            [orderId, tenantId]
        );
        if (rows.length === 0) return { error: 'not_found' as const };
        if (rows[0].customer_id !== customerId) return { error: 'forbidden' as const };
        if (rows[0].payment_method === 'SelfCollection') {
            return { eta_minutes: null as number | null, reason: 'pickup' as const };
        }
        if (String(rows[0].status || '') !== 'OutForDelivery') {
            return { eta_minutes: null as number | null, reason: 'not_out_for_delivery' as const };
        }
        const dlat = rows[0].delivery_lat != null ? parseFloat(String(rows[0].delivery_lat)) : NaN;
        const dlng = rows[0].delivery_lng != null ? parseFloat(String(rows[0].delivery_lng)) : NaN;
        const rlat = rows[0].rider_lat != null ? parseFloat(String(rows[0].rider_lat)) : NaN;
        const rlng = rows[0].rider_lng != null ? parseFloat(String(rows[0].rider_lng)) : NaN;
        if (![dlat, dlng, rlat, rlng].every((n) => Number.isFinite(n))) {
            return { eta_minutes: null as number | null, reason: 'no_coordinates' as const };
        }
        const sec = await getDrivingDurationSeconds(rlat, rlng, dlat, dlng);
        if (sec == null) {
            return { eta_minutes: null as number | null, reason: 'directions_unavailable' as const };
        }
        return { eta_minutes: Math.max(1, Math.ceil(sec / 60)), eta_seconds: sec };
    }

    // ─── Status Updates (POS side) ─────────────────────────────────────

    async updateOrderStatus(tenantId: string, orderId: string, newStatus: string, changedBy: string, changedByType: string = 'shop_user', note?: string) {
        if (!VALID_STATUSES.includes(newStatus as OrderStatus)) {
            throw new Error(`Invalid status: ${newStatus}. Valid: ${VALID_STATUSES.join(', ')}`);
        }

        const orders = await this.db.query(
            'SELECT id, status, customer_id, payment_method, COALESCE(inventory_deducted, FALSE) AS inventory_deducted FROM mobile_orders WHERE id = $1 AND tenant_id = $2',
            [orderId, tenantId]
        );
        if (orders.length === 0) throw new Error('Order not found');

        if (changedByType === 'shop_user') {
            const assigned = await this.db.query(
                'SELECT 1 FROM delivery_orders WHERE order_id = $1 AND tenant_id = $2 LIMIT 1',
                [orderId, tenantId]
            );
            if (assigned.length > 0) {
                throw new Error(
                    'A rider is assigned to this order. Fulfillment status is updated from the rider app only.'
                );
            }
        }

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

            // Inventory: reservation stays from mobile place order until Delivered (deduct + release) or Cancelled (release only).
            if (newStatus === 'Delivered') {
                if (!orders[0].inventory_deducted) {
                    await this.adjustInventoryForOrder(client, tenantId, orderId, 'deliver');
                }
            } else if (newStatus === 'Cancelled') {
                await this.adjustInventoryForOrder(client, tenantId, orderId, 'cancel');
            }

            return { success: true, orderId, from: currentStatus, to: newStatus };
        });
        if (newStatus === 'Delivered' || newStatus === 'Cancelled') {
            try {
                invalidateInventorySkuListCache(tenantId);
            } catch {
                /* ignore */
            }
        }
        if (newStatus === 'Delivered') {
            try {
                const { getShopService } = await import('./shopService.js');
                await getShopService().awardLoyaltyForMobileOrderDelivered(tenantId, orderId);
            } catch (loyErr: any) {
                console.error('awardLoyaltyForMobileOrderDelivered:', loyErr?.message || loyErr);
            }
        }
        const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
        notifyDailyReportUpdated(tenantId).catch(() => {});
        return result;
    }

    /**
     * POS: manually assign an AVAILABLE rider when the order has no delivery_orders row yet (e.g. auto-assign missed).
     */
    async assignRiderManually(tenantId: string, orderId: string, riderId: string) {
        const rows = await this.db.query(
            `SELECT id, status, payment_method, delivery_lat, delivery_lng, assigned_branch_id
       FROM mobile_orders WHERE id = $1 AND tenant_id = $2`,
            [orderId, tenantId]
        );
        if (rows.length === 0) throw new Error('Order not found');
        const o = rows[0] as any;
        if (String(o.payment_method) === 'SelfCollection') {
            throw new Error('Self-collection orders do not use riders.');
        }
        if (o.status === 'Delivered' || o.status === 'Cancelled') {
            throw new Error('Cannot assign a rider to a completed or cancelled order.');
        }
        const existing = await this.db.query(
            `SELECT id FROM delivery_orders WHERE order_id = $1 AND tenant_id = $2 LIMIT 1`,
            [orderId, tenantId]
        );
        if (existing.length > 0) {
            throw new Error('This order already has a rider assignment.');
        }

        await this.db.transaction(async (client: any) => {
            await manuallyAssignRiderForMobileOrder(client, tenantId, orderId, riderId, {
                deliveryLat: o.delivery_lat,
                deliveryLng: o.delivery_lng,
                assignedBranchId: o.assigned_branch_id,
            });
        });

        const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
        notifyDailyReportUpdated(tenantId).catch(() => {});
        return { success: true, orderId };
    }

    /** POS Mobile Orders page: rider list + availability counts + open delivery jobs. */
    async getPosRidersOverview(tenantId: string) {
        const { getRiderService } = await import('./riderService.js');
        const riders = await getRiderService().listByTenant(tenantId);
        const openRows = await this.db.query(
            `SELECT COUNT(*) AS c FROM delivery_orders WHERE tenant_id = $1 AND status != 'DELIVERED'`,
            [tenantId]
        );
        const openDeliveries = parseInt(String((openRows[0] as any)?.c ?? 0), 10) || 0;
        const active = riders.filter((r) => r.is_active === true || (r as any).is_active === 1);
        const stats = {
            total: riders.length,
            active_accounts: active.length,
            inactive_accounts: riders.length - active.length,
            available: active.filter((r) => r.status === 'AVAILABLE').length,
            busy: active.filter((r) => r.status === 'BUSY').length,
            offline: active.filter((r) => r.status === 'OFFLINE').length,
            open_deliveries: openDeliveries,
        };
        return { riders, stats };
    }

    private async adjustInventoryForOrder(client: any, tenantId: string, orderId: string, action: 'deliver' | 'cancel') {
        const items = await client.query(
            'SELECT product_id, quantity FROM mobile_order_items WHERE order_id = $1 AND tenant_id = $2',
            [orderId, tenantId]
        );

        const warehouseId = await getWarehouseIdForMobileOrder(client, tenantId, orderId);
        if (!warehouseId) return;

        for (const item of items) {
            const qty = parseFloat(item.quantity);

            if (action === 'deliver') {
                const fefo = await deductInventoryFefo(
                    client,
                    tenantId,
                    item.product_id,
                    warehouseId,
                    qty,
                    orderId
                );
                const unitCostAtDeliver = await fetchUnitCostForProduct(client, tenantId, item.product_id);
                let unitCost =
                    fefo.weightedUnitCost != null && fefo.weightedUnitCost > 0
                        ? fefo.weightedUnitCost
                        : unitCostAtDeliver > 0
                          ? unitCostAtDeliver
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
           VALUES ($1, $2, $3, $4, 'MobileSale', $5, $6, 'Mobile order delivered', $7, $8)`,
                    [generateId('im'), tenantId, item.product_id, warehouseId, -qty, orderId, unitCost, totalCost]
                );
            } else if (action === 'cancel') {
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

        if (action === 'deliver') {
            await client.query(
                `UPDATE mobile_orders SET inventory_deducted = TRUE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
                [orderId, tenantId]
            );
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

    // ─── Collect Payment via Khata (Delivered → Paid on credit) ─────────

    async collectPaymentKhata(tenantId: string, orderId: string, changedBy: string) {
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
        if (!order.customer_id) {
            throw new Error('Order has no customer — khata requires a customer');
        }

        const custRows = await this.db.query(
            'SELECT id, pos_contact_id, name, phone_number FROM customers WHERE id = $1 AND tenant_id = $2',
            [order.customer_id, tenantId]
        );
        if (custRows.length === 0) throw new Error('Customer record not found');
        const customer = custRows[0];

        let contactId = customer.pos_contact_id;

        if (!contactId) {
            const contactRes = await this.db.query(
                `INSERT INTO contacts (tenant_id, name, contact_no, type, address)
                 VALUES ($1, $2, $3, 'Customer', NULL)
                 RETURNING id`,
                [tenantId, customer.name, customer.phone_number]
            );
            contactId = contactRes[0].id;
            await this.db.query(
                'UPDATE customers SET pos_contact_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
                [contactId, customer.id, tenantId]
            );
        }

        const grandTotal = parseFloat(order.grand_total);

        return this.db.transaction(async (client: any) => {
            // 1. Mark order as Paid
            await client.query(
                `UPDATE mobile_orders SET payment_status = 'Paid', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
                [orderId, tenantId]
            );

            // 2. Insert khata debit entry (order_id is NULL since khata_ledger FK references shop_sales)
            await client.query(
                `INSERT INTO khata_ledger (tenant_id, customer_id, order_id, type, amount, note)
                 VALUES ($1, $2, NULL, 'debit', $3, $4)`,
                [tenantId, contactId, grandTotal, `Mobile Order ${order.order_number}`]
            );

            // 3. GL: Debit Trade Receivables, Credit Accounts Receivable (no cash movement)
            // Trade Receivables stays debited — the AR that was booked at order creation is now khata
            // No bank balance update needed

            // 4. Record in status history
            await client.query(
                `INSERT INTO mobile_order_status_history (id, tenant_id, order_id, from_status, to_status, changed_by, changed_by_type, note)
                 VALUES ($1, $2, $3, 'Unpaid', 'Paid', $4, 'shop_user', $5)`,
                [generateId('mosh'), tenantId, orderId, changedBy, 'Payment via Khata / Credit']
            );

            return { success: true, orderId, paymentStatus: 'Paid', paymentType: 'khata' };
        });
    }

    // ─── POS-side queries ──────────────────────────────────────────────

    async getMobileOrdersForPOS(tenantId: string, status?: string) {
        let query = `
      SELECT o.*, mc.phone as customer_phone, mc.name as customer_name,
        d.id AS delivery_order_id, d.status AS delivery_status,
        r.id AS rider_id, r.name AS rider_name, r.phone_number AS rider_phone,
        r.current_latitude AS rider_latitude, r.current_longitude AS rider_longitude,
        r.status AS rider_operational_status,
        ab.name AS assigned_branch_name,
        COALESCE(
          (SELECT mobile_customer_verified FROM shop_loyalty_members
           WHERE id = o.loyalty_member_id AND tenant_id = o.tenant_id LIMIT 1),
          (SELECT lm.mobile_customer_verified
           FROM mobile_customers mc2
           INNER JOIN contacts c ON c.tenant_id = mc2.tenant_id
             AND regexp_replace(COALESCE(mc2.phone, ''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(c.contact_no, ''), '[^0-9]', '', 'g')
             AND length(regexp_replace(COALESCE(mc2.phone, ''), '[^0-9]', '', 'g')) > 0
           INNER JOIN shop_loyalty_members lm ON lm.customer_id = c.id AND lm.tenant_id = c.tenant_id
           WHERE mc2.id = o.customer_id AND mc2.tenant_id = o.tenant_id
           LIMIT 1),
          FALSE
        ) AS customer_mobile_verified,
        mc.email AS customer_email,
        (SELECT COUNT(*)::int FROM mobile_orders mo_c
         WHERE mo_c.customer_id = o.customer_id AND mo_c.tenant_id = o.tenant_id) AS customer_order_count,
        COALESCE(
          (SELECT lm.tier FROM shop_loyalty_members lm
           WHERE lm.id = o.loyalty_member_id AND lm.tenant_id = o.tenant_id LIMIT 1),
          (SELECT lm.tier
           FROM mobile_customers mc2
           INNER JOIN contacts c ON c.tenant_id = mc2.tenant_id
             AND regexp_replace(COALESCE(mc2.phone, ''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(c.contact_no, ''), '[^0-9]', '', 'g')
             AND length(regexp_replace(COALESCE(mc2.phone, ''), '[^0-9]', '', 'g')) > 0
           INNER JOIN shop_loyalty_members lm ON lm.customer_id = c.id AND lm.tenant_id = c.tenant_id
           WHERE mc2.id = o.customer_id AND mc2.tenant_id = o.tenant_id
           LIMIT 1),
          NULL
        ) AS customer_loyalty_tier
      FROM mobile_orders o
      LEFT JOIN mobile_customers mc ON o.customer_id = mc.id AND mc.tenant_id = $1
      LEFT JOIN delivery_orders d ON d.order_id = o.id AND d.tenant_id = o.tenant_id
      LEFT JOIN riders r ON r.id = d.rider_id AND r.tenant_id = o.tenant_id
      LEFT JOIN shop_branches ab ON ab.id = o.assigned_branch_id AND ab.tenant_id = o.tenant_id
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
        return (rows as any[]).map((o: any) =>
            enrichOrderWithRiderToDropoff({
                ...o,
                subtotal: safeNum(o.subtotal),
                tax_total: safeNum(o.tax_total),
                discount_total: safeNum(o.discount_total),
                delivery_fee: safeNum(o.delivery_fee),
                grand_total: safeNum(o.grand_total),
            }) as any
        );
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
