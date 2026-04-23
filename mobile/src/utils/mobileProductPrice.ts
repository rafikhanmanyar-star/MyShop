/**
 * Customer-facing list price; matches server COALESCE(mobile_price, retail_price).
 * Cached API rows usually include `price` (already resolved).
 */
export function effectiveMobileListPrice(p: {
    price?: number | string | null;
    mobile_price?: number | string | null;
    retail_price?: number | string | null;
}): number {
    if (p == null) return 0;
    if (p.price != null && p.price !== '' && Number.isFinite(Number(p.price))) return Number(p.price);
    if (p.mobile_price != null && p.mobile_price !== '' && Number.isFinite(Number(p.mobile_price))) {
        return Number(p.mobile_price);
    }
    const r = p.retail_price;
    if (r != null && r !== '' && Number.isFinite(Number(r))) return Number(r);
    return 0;
}

export function isMobileCatalogPriceListed(p: { price?: number | string | null; mobile_price?: number | string | null; retail_price?: number | string | null }): boolean {
    return effectiveMobileListPrice(p) > 0;
}
