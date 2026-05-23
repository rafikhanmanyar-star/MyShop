const key = (shopSlug: string) => `myshop_favorite_product_ids_${shopSlug}`;

export function getFavoriteIds(shopSlug: string): Set<string> {
    try {
        const raw = localStorage.getItem(key(shopSlug));
        if (!raw) return new Set();
        const arr = JSON.parse(raw) as unknown;
        if (!Array.isArray(arr)) return new Set();
        return new Set(arr.map(String));
    } catch {
        return new Set();
    }
}

export function setFavoriteIds(shopSlug: string, ids: Iterable<string>): void {
    try {
        localStorage.setItem(key(shopSlug), JSON.stringify([...ids]));
    } catch {
        /* */
    }
}

export function toggleFavoriteId(shopSlug: string, productId: string): Set<string> {
    const cur = getFavoriteIds(shopSlug);
    if (cur.has(productId)) cur.delete(productId);
    else cur.add(productId);
    setFavoriteIds(shopSlug, cur);
    return cur;
}
