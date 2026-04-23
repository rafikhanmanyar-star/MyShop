import { isMobileCatalogPriceListed } from './mobileProductPrice';

/**
 * Categories from GET /mobile/:slug/categories may include `product_count` (sellable mobile-visible products
 * for that category_id). When missing (older caches), we optionally use per-id counts from cached products.
 */
export function filterCategoriesWithListedProducts<T extends { id: string; product_count?: number | null }>(
    categories: T[],
    listedCountByCategoryId?: Map<string, number> | null
): T[] {
    return categories.filter((c) => {
        if (c.product_count != null && c.product_count !== undefined && String(c.product_count) !== '') {
            return Number(c.product_count) > 0;
        }
        if (listedCountByCategoryId) {
            return (listedCountByCategoryId.get(String(c.id)) ?? 0) > 0;
        }
        return true;
    });
}

export function countListedProductsByCategoryId(products: any[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const p of products) {
        if (!p?.category_id) continue;
        if (!isMobileCatalogPriceListed(p)) continue;
        const stock = Number(p.stock ?? p.available_stock) > 0;
        if (!stock && !p.is_pre_order) continue;
        const id = String(p.category_id);
        m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
}
