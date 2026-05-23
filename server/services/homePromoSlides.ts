/** Mobile home ad carousel — shared parse/validate (stored in tenant_branding.home_promo_slides JSON). */

function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return new URL(trimmed).pathname;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export const HOME_PROMO_MAX_SLIDES = 15;
export const HOME_PROMO_INTERVAL_MIN_SEC = 3;
export const HOME_PROMO_INTERVAL_MAX_SEC = 30;
export const HOME_PROMO_INTERVAL_DEFAULT_SEC = 5;

export const HOME_PROMO_LINK_TYPES = [
  'none',
  'products',
  'offers',
  'deals',
  'recipes',
  'voice_order',
  'budget',
  'utilities',
  'feedback',
  'custom',
] as const;

export type HomePromoLinkType = (typeof HOME_PROMO_LINK_TYPES)[number];

export interface HomePromoSlide {
  image_url: string;
  link_type: HomePromoLinkType;
  link_url: string | null;
  /** Optional label for accessibility / POS list */
  title: string | null;
}

export function clampHomePromoIntervalSeconds(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return HOME_PROMO_INTERVAL_DEFAULT_SEC;
  return Math.min(
    HOME_PROMO_INTERVAL_MAX_SEC,
    Math.max(HOME_PROMO_INTERVAL_MIN_SEC, Math.round(n))
  );
}

function normalizeLinkType(raw: unknown, linkUrl: string | null): HomePromoLinkType {
  const t = String(raw ?? '').trim().toLowerCase();
  if ((HOME_PROMO_LINK_TYPES as readonly string[]).includes(t)) {
    return t as HomePromoLinkType;
  }
  if (linkUrl) return 'custom';
  return 'none';
}

export function parseHomePromoSlides(raw: unknown): HomePromoSlide[] {
  if (raw == null || raw === '') return [];
  let arr: unknown[] = [];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      arr = Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else {
    return [];
  }

  const out: HomePromoSlide[] = [];
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const img = normalizeImageUrl(String(o.image_url ?? ''));
    if (!img) continue;
    const linkUrl =
      o.link_url == null || String(o.link_url).trim() === '' ? null : String(o.link_url).trim();
    const link_type = normalizeLinkType(o.link_type, linkUrl);
    const title =
      o.title == null || String(o.title).trim() === '' ? null : String(o.title).trim();
    out.push({
      image_url: img,
      link_type,
      link_url: link_type === 'custom' ? linkUrl : null,
      title,
    });
    if (out.length >= HOME_PROMO_MAX_SLIDES) break;
  }
  return out;
}

export function homePromoSlidesToStoredJson(input: unknown): string {
  return JSON.stringify(parseHomePromoSlides(input));
}

export function preserveHomePromoSlidesStored(existingRaw: unknown): string {
  if (existingRaw == null || existingRaw === '') return '[]';
  if (typeof existingRaw === 'string') {
    const t = existingRaw.trim();
    return t || '[]';
  }
  return homePromoSlidesToStoredJson(existingRaw);
}
