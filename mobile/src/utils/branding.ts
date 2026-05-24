import type { HomePromoSlide, TenantBranding } from '../context/AppContext';

export function normalizeBrandingFromApi(raw: unknown): TenantBranding | null {
    if (!raw || typeof raw !== 'object') return null;
    const b = { ...(raw as TenantBranding) };
    let slides: unknown = (b as unknown as { home_promo_slides?: unknown }).home_promo_slides;
    if (typeof slides === 'string') {
        try {
            slides = JSON.parse(slides);
        } catch {
            slides = [];
        }
    }
    if (!Array.isArray(slides)) slides = [];
    const intervalRaw = (b as { home_promo_interval_seconds?: unknown }).home_promo_interval_seconds;
    const intervalSec = Number(intervalRaw);
    const home_promo_interval_seconds =
        Number.isFinite(intervalSec) && intervalSec >= 3 && intervalSec <= 30
            ? Math.round(intervalSec)
            : 5;
    return { ...b, home_promo_slides: slides as HomePromoSlide[], home_promo_interval_seconds };
}

/** Compare branding promo config (slides + interval) for POS updates. */
export function brandingPromoConfigKey(branding: TenantBranding | null | undefined): string {
    const slides = branding?.home_promo_slides ?? [];
    const urls =
        Array.isArray(slides) && slides.length > 0
            ? slides
                  .map((s) => String(s.image_url ?? '').trim())
                  .filter(Boolean)
                  .join('\u0001')
            : '';
    const interval = branding?.home_promo_interval_seconds ?? 5;
    return `${urls}\u0002${interval}`;
}
