/** Match server `normalizeShopSlugForLookup` so login sends the same slug the API expects. */
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
