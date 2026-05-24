/**
 * Prefetch home promo carousel images into IndexedDB (imageCache) so slides
 * load instantly on revisit. Re-fetches only when slide URLs change (POS config).
 */

import { getFullImageUrl } from '../api';
import type { HomePromoSlide } from '../context/AppContext';
import { homePromoSlidesKey, slideImageUrl } from '../utils/homePromoSlides';
import { fetchAndCacheImage } from './imageCache';

let lastPrefetchedSlidesKey = '';

/** Prefetch slide images when branding changes; skips if URLs unchanged. */
export async function prefetchHomePromoSlideImages(slides: HomePromoSlide[] | undefined): Promise<void> {
    const valid = (slides ?? []).filter((s) => slideImageUrl(s));
    const key = homePromoSlidesKey(valid);
    if (key === lastPrefetchedSlidesKey) return;
    lastPrefetchedSlidesKey = key;

    if (!key || typeof navigator === 'undefined' || !navigator.onLine) return;

    await Promise.all(
        valid.map(async (slide) => {
            const path = slideImageUrl(slide);
            const fullUrl = getFullImageUrl(path);
            if (fullUrl) await fetchAndCacheImage(fullUrl, path);
        }),
    );
}

/** Force next prefetch (e.g. after manual cache clear). */
export function resetHomePromoPrefetchKey(): void {
    lastPrefetchedSlidesKey = '';
}
