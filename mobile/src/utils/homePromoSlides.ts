import type { HomePromoSlide } from '../context/AppContext';

/** Normalize slides from API/cache (array or JSON string). */
export function coerceHomePromoSlides(raw: unknown): HomePromoSlide[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as HomePromoSlide[];
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return Array.isArray(p) ? (p as HomePromoSlide[]) : [];
        } catch {
            return [];
        }
    }
    return [];
}

export function slideImageUrl(slide: HomePromoSlide): string {
    const url = slide.image_url ?? (slide as { imageUrl?: string }).imageUrl;
    return String(url ?? '').trim();
}

/** Stable key for carousel reset / autoplay when slide images change. */
export function homePromoSlidesKey(slides: HomePromoSlide[]): string {
    return slides.map((s) => slideImageUrl(s)).filter(Boolean).join('\u0001');
}
