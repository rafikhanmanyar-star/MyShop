const POS_RECENT_PRODUCTS_KEY = 'pos-recent-product-ids';
const POS_FAVORITE_PRODUCTS_KEY = 'pos-favorite-product-ids';
const MAX_RECENT = 24;

export function loadRecentProductIds(): string[] {
    try {
        const raw = localStorage.getItem(POS_RECENT_PRODUCTS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').slice(0, MAX_RECENT) : [];
    } catch {
        return [];
    }
}

export function pushRecentProductId(productId: string) {
    try {
        const prev = loadRecentProductIds().filter((id) => id !== productId);
        const next = [productId, ...prev].slice(0, MAX_RECENT);
        localStorage.setItem(POS_RECENT_PRODUCTS_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
}

export function loadFavoriteProductIds(): string[] {
    try {
        const raw = localStorage.getItem(POS_FAVORITE_PRODUCTS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

export function toggleFavoriteProductId(productId: string): string[] {
    const prev = loadFavoriteProductIds();
    const next = prev.includes(productId) ? prev.filter((id) => id !== productId) : [productId, ...prev];
    try {
        localStorage.setItem(POS_FAVORITE_PRODUCTS_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
    return next;
}
