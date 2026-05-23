/**
 * Warm product-card font faces after first paint — avoids blocking render.
 * Google Fonts link in index.html handles download; this primes the renderer cache.
 */
export function preloadProductCardFonts(): void {
  if (typeof document === 'undefined' || !document.fonts?.load) return;

  const loads = [
    document.fonts.load('500 13px Inter'),
    document.fonts.load('700 16px Inter'),
    document.fonts.load('400 12px "Noto Sans Arabic"'),
  ];

  void Promise.allSettled(loads);
}
