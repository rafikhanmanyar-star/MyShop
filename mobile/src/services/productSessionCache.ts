/** In-memory cache for PDP + recommendations (per browser tab session). */

const detailCache = new Map<string, unknown>();
/** `undefined` = not yet fetched; array (possibly empty) = fetched */
const recsCache = new Map<string, unknown[]>();

function key(slug: string, productId: string) {
    return `${slug}::${productId}`;
}

export function getSessionProductDetail(shopSlug: string, productId: string): unknown | null {
    return detailCache.get(key(shopSlug, productId)) ?? null;
}

export function setSessionProductDetail(shopSlug: string, productId: string, data: unknown): void {
    detailCache.set(key(shopSlug, productId), data);
}

export function getSessionRecommendations(shopSlug: string, productId: string): unknown[] | undefined {
    return recsCache.get(key(shopSlug, productId));
}

export function setSessionRecommendations(shopSlug: string, productId: string, items: unknown[]): void {
    recsCache.set(key(shopSlug, productId), items);
}
