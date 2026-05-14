const key = (shopSlug: string) => `myshop_recent_searches_${shopSlug}`;

export function getRecentSearches(shopSlug: string): string[] {
    try {
        const raw = localStorage.getItem(key(shopSlug));
        if (!raw) return [];
        const arr = JSON.parse(raw) as unknown;
        if (!Array.isArray(arr)) return [];
        return arr.map(String).filter((s) => s.trim()).slice(0, 10);
    } catch {
        return [];
    }
}

export function addRecentSearch(shopSlug: string, term: string): void {
    const t = term.trim();
    if (!t) return;
    const prev = getRecentSearches(shopSlug).filter((x) => x.toLowerCase() !== t.toLowerCase());
    const next = [t, ...prev].slice(0, 10);
    try {
        localStorage.setItem(key(shopSlug), JSON.stringify(next));
    } catch {
        /* quota */
    }
}

export function removeRecentSearch(shopSlug: string, term: string): void {
    const next = getRecentSearches(shopSlug).filter((x) => x.toLowerCase() !== term.toLowerCase());
    try {
        localStorage.setItem(key(shopSlug), JSON.stringify(next));
    } catch {
        /* */
    }
}

export function clearRecentSearches(shopSlug: string): void {
    try {
        localStorage.removeItem(key(shopSlug));
    } catch {
        /* */
    }
}
