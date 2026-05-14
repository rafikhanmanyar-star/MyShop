import { randomUUID } from 'crypto';
import { getDatabaseService } from './databaseService.js';
import { typesenseSearchSuggestions } from './search/typesenseProductSearchService.js';
import { isTypesenseConfigured } from './search/typesenseConfig.js';

const DEFAULT_TRENDING = ['Groceries', 'Fresh produce', 'Household', 'Snacks', 'Mobile accessories'];

export type SearchSuggestionSection = {
    type: 'product' | 'brand' | 'category' | 'trending' | 'recent';
    title: string;
    items: { id: string; label: string; subtitle?: string; meta?: Record<string, unknown> }[];
};

/** Wildcard-safe LIKE/ILIKE pattern (user % and _ stripped). */
function safeLike(q: string): string {
    const t = q.trim().replace(/%/g, '').replace(/_/g, '');
    return `%${t}%`;
}

export class MobileSearchService {
    private db = getDatabaseService();

    async getSuggestions(
        tenantId: string,
        q: string,
        recentFromClient: string[] = []
    ): Promise<{ sections: SearchSuggestionSection[]; query: string }> {
        const query = q.trim();
        const sections: SearchSuggestionSection[] = [];

        if (query.length < 2) {
            const trending = await this.getTrendingTerms(tenantId);
            sections.push({
                type: 'trending',
                title: 'Trending',
                items: trending.map((t) => ({ id: `trend:${t}`, label: t })),
            });
            if (recentFromClient.length) {
                sections.push({
                    type: 'recent',
                    title: 'Recent',
                    items: recentFromClient.slice(0, 10).map((t) => ({ id: `recent:${t}`, label: t })),
                });
            }
            return { sections, query };
        }

        const pattern = safeLike(query);
        const lim = 6;

        if (isTypesenseConfigured()) {
            const hits = await typesenseSearchSuggestions(tenantId, query, lim);
            if (hits.length) {
                sections.push({
                    type: 'product',
                    title: 'Products',
                    items: hits.map((h) => ({
                        id: h.id,
                        label: h.name,
                        subtitle: [h.brand, h.category].filter(Boolean).join(' · ') || undefined,
                        meta: { productId: h.id },
                    })),
                });
            }
        }

        const type = this.db.getType();

        const productSql =
            type === 'postgres'
                ? `SELECT p.id, p.name,
                          COALESCE(NULLIF(TRIM(p.brand), ''), b.name) AS brand_name,
                          c.name AS category_name
                   FROM shop_products p
                   LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = p.tenant_id
                   LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = p.tenant_id
                   WHERE p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE
                     AND COALESCE(p.sales_deactivated, FALSE) = FALSE
                     AND COALESCE(p.mobile_price, p.retail_price) > 0
                     AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR COALESCE(p.mobile_description,'') ILIKE $2
                          OR COALESCE(c.name,'') ILIKE $2 OR COALESCE(b.name,'') ILIKE $2
                          OR COALESCE(NULLIF(TRIM(p.brand),''), '') ILIKE $2
                          OR COALESCE(p.barcode,'') ILIKE $2
                          OR COALESCE(p.attributes::text, '') ILIKE $2)
                   ORDER BY p.total_sales DESC NULLS LAST
                   LIMIT $3`
                : `SELECT p.id, p.name,
                          COALESCE(NULLIF(TRIM(p.brand), ''), b.name) AS brand_name,
                          c.name AS category_name
                   FROM shop_products p
                   LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = p.tenant_id
                   LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = p.tenant_id
                   WHERE p.tenant_id = $1 AND p.is_active = 1 AND p.mobile_visible = 1
                     AND COALESCE(p.sales_deactivated, 0) = 0
                     AND COALESCE(p.mobile_price, p.retail_price) > 0
                     AND (p.name LIKE $2 OR p.sku LIKE $2 OR IFNULL(p.mobile_description,'') LIKE $2
                          OR IFNULL(c.name,'') LIKE $2 OR IFNULL(b.name,'') LIKE $2
                          OR IFNULL(NULLIF(TRIM(p.brand),''), '') LIKE $2
                          OR IFNULL(p.barcode,'') LIKE $2
                          OR IFNULL(p.attributes,'') LIKE $2)
                   ORDER BY p.total_sales DESC
                   LIMIT $3`;

        if (!sections.some((s) => s.type === 'product')) {
            const prows = await this.db.query(productSql, [tenantId, pattern, lim]);
            if (prows.length) {
                sections.push({
                    type: 'product',
                    title: 'Products',
                    items: prows.map((r: any) => ({
                        id: String(r.id),
                        label: String(r.name),
                        subtitle: [r.brand_name, r.category_name].filter(Boolean).join(' · ') || undefined,
                        meta: { productId: String(r.id) },
                    })),
                });
            }
        }

        const brandSql =
            type === 'postgres'
                ? `SELECT id, name FROM shop_brands WHERE tenant_id = $1 AND name ILIKE $2 ORDER BY name ASC LIMIT $3`
                : `SELECT id, name FROM shop_brands WHERE tenant_id = $1 AND name LIKE $2 ORDER BY name ASC LIMIT $3`;
        const brows = await this.db.query(brandSql, [tenantId, pattern, 5]);
        if (brows.length) {
            sections.push({
                type: 'brand',
                title: 'Brands',
                items: brows.map((r: any) => ({
                    id: String(r.id),
                    label: String(r.name),
                    meta: { brandId: String(r.id) },
                })),
            });
        }

        const catSql =
            type === 'postgres'
                ? `SELECT id, name FROM categories WHERE tenant_id = $1 AND name ILIKE $2 ORDER BY name ASC LIMIT $3`
                : `SELECT id, name FROM categories WHERE tenant_id = $1 AND name LIKE $2 ORDER BY name ASC LIMIT $3`;
        const crows = await this.db.query(catSql, [tenantId, pattern, 5]);
        if (crows.length) {
            sections.push({
                type: 'category',
                title: 'Categories',
                items: crows.map((r: any) => ({
                    id: String(r.id),
                    label: String(r.name),
                    meta: { categoryId: String(r.id) },
                })),
            });
        }

        const trending = await this.getTrendingTerms(tenantId);
        const trendFiltered = trending.filter((t) => t.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
        if (trendFiltered.length) {
            sections.push({
                type: 'trending',
                title: 'Trending',
                items: trendFiltered.map((t) => ({ id: `trend:${t}`, label: t })),
            });
        }

        const recentMatch = recentFromClient.filter((t) => t.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
        if (recentMatch.length) {
            sections.push({
                type: 'recent',
                title: 'Recent searches',
                items: recentMatch.map((t) => ({ id: `recent:${t}`, label: t })),
            });
        }

        return { sections, query };
    }

    async getTrendingTerms(tenantId: string): Promise<string[]> {
        try {
            const active = this.db.getType() === 'postgres' ? 'is_active = TRUE' : 'is_active != 0';
            const rows = await this.db.query(
                `SELECT keyword FROM mobile_trending_search_terms
                 WHERE tenant_id = $1 AND ${active}
                 ORDER BY display_order ASC, weight DESC, keyword ASC
                 LIMIT 20`,
                [tenantId]
            );
            const fromDb = rows.map((r: any) => String(r.keyword)).filter(Boolean);
            if (fromDb.length) return fromDb;
        } catch {
            /* table missing before migration */
        }
        return [...DEFAULT_TRENDING];
    }

    async recordSearchEvent(params: {
        tenantId: string;
        customerId?: string | null;
        sessionId?: string | null;
        eventType: string;
        keyword?: string | null;
        productId?: string | null;
        meta?: Record<string, unknown>;
    }): Promise<void> {
        const id = randomUUID();
        const metaJson = JSON.stringify(params.meta || {});
        try {
            await this.db.execute(
                this.db.getType() === 'postgres'
                    ? `INSERT INTO mobile_search_events (id, tenant_id, customer_id, session_id, event_type, keyword, product_id, meta)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`
                    : `INSERT INTO mobile_search_events (id, tenant_id, customer_id, session_id, event_type, keyword, product_id, meta)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    id,
                    params.tenantId,
                    params.customerId ?? null,
                    params.sessionId ?? null,
                    params.eventType,
                    params.keyword ?? null,
                    params.productId ?? null,
                    metaJson,
                ]
            );
        } catch (e: any) {
            console.warn('[mobileSearch] analytics insert skipped:', e?.message || e);
        }
    }
}

let inst: MobileSearchService | null = null;
export function getMobileSearchService(): MobileSearchService {
    if (!inst) inst = new MobileSearchService();
    return inst;
}
