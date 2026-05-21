import type { HomePromoSlide } from '../context/AppContext';

export type { HomePromoLinkType } from '../context/AppContext';

export function isExternalHref(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/** Resolve tap target for a home promo slide (null = display only, no navigation). */
export function resolveHomePromoHref(shopSlug: string, slide: HomePromoSlide): string | null {
  const type = slide.link_type ?? (slide.link_url?.trim() ? 'custom' : 'none');
  if (type === 'none') return null;
  if (type === 'custom') {
    const u = slide.link_url?.trim();
    if (!u) return null;
    if (isExternalHref(u)) return u;
    if (u.startsWith('/')) return u;
    return `/${shopSlug}/${u.replace(/^\//, '')}`;
  }
  const base = `/${shopSlug}`;
  switch (type) {
    case 'products':
      return `${base}/products`;
    case 'offers':
      return `${base}/offers`;
    case 'deals':
      return `${base}/products?filterDeals=true`;
    case 'recipes':
      return `${base}/recipes`;
    case 'voice_order':
      return `${base}/voice-order`;
    case 'budget':
      return `${base}/budget`;
    case 'utilities':
      return `${base}/utilities`;
    default:
      return null;
  }
}
