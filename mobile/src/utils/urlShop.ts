/**
 * Derive the shop slug from the current URL when the path is root (/).
 * Used so the app can bind to one shop and skip the "choose a shop" landing page.
 *
 * Sources (in order):
 * 1. Query param: ?shop=my-shop
 * 2. Subdomain: my-shop.mobile.example.com → my-shop (first segment, skip "www")
 */
export function getShopSlugFromUrl(): string | null {
    if (typeof window === 'undefined') return null;

    const url = new URL(window.location.href);

    // Query param takes precedence
    const fromQuery = url.searchParams.get('shop');
    if (fromQuery && fromQuery.trim()) {
        const slug = fromQuery.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (slug) return slug;
    }

    // Subdomain: first segment of hostname (e.g. my-shop.mobile.example.com)
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2 && parts[0] !== 'www') {
        const candidate = parts[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (candidate) return candidate;
    }

    return null;
}

/**
 * Returns true when the app is at root path (/) with no shop in the path.
 * Used to decide whether to try URL-based slug and redirect.
 */
export function isAtRootWithoutShopInPath(): boolean {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === '/';
}
