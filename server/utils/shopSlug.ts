/**
 * Normalize user input for shop discovery (mobile ordering URL, rider login "shop code").
 * - Trims, lowercases
 * - If a full URL or path is pasted, uses the first path segment (the shop slug)
 */
export function normalizeShopSlugForLookup(raw: string): string {
    let s = String(raw ?? '').trim();
    if (!s) return '';

    if (s.includes('://')) {
        try {
            const u = new URL(s);
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts.length) {
                s = parts[0];
            } else {
                const host = u.hostname.replace(/^www\./, '');
                if (host && !/^localhost$/i.test(host)) {
                    const seg = host.split('.')[0];
                    if (seg) s = seg;
                }
            }
        } catch {
            /* ignore */
        }
    } else if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\//i.test(s)) {
        try {
            const u = new URL(`https://${s}`);
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts.length) s = parts[0];
        } catch {
            /* ignore */
        }
    } else {
        s = s.replace(/^\/+/, '');
        const parts = s.split('/').filter(Boolean);
        if (parts.length) s = parts[0];
        s = s.split('?')[0].split('#')[0];
    }

    return s.trim().toLowerCase();
}
