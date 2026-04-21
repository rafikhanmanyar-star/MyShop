/** In-memory cache for PDP (per browser tab session). Recommendations are fetched fresh per visit. */

const detailCache = new Map<string, unknown>();

function key(slug: string, productId: string) {
    return `${slug}::${productId}`;
}

export function getSessionProductDetail(shopSlug: string, productId: string): unknown | null {
    return detailCache.get(key(shopSlug, productId)) ?? null;
}

export function setSessionProductDetail(shopSlug: string, productId: string, data: unknown): void {
    detailCache.set(key(shopSlug, productId), data);
}
