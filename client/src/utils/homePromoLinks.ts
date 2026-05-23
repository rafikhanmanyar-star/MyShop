import type { HomePromoLinkType, HomePromoSlide } from '../services/shopApi';

export const HOME_PROMO_MAX_SLIDES = 15;
export const HOME_PROMO_INTERVAL_MIN_SEC = 3;
export const HOME_PROMO_INTERVAL_MAX_SEC = 30;

export const HOME_PROMO_LINK_TYPE_OPTIONS: { value: HomePromoLinkType; label: string; hint: string }[] = [
  { value: 'none', label: 'No link', hint: 'Image only — tap does nothing' },
  { value: 'products', label: 'Shop / products', hint: 'Opens product catalog' },
  { value: 'offers', label: 'Offers & promotions', hint: 'Opens offers page' },
  { value: 'deals', label: 'Deals', hint: 'Opens catalog filtered to deals' },
  { value: 'recipes', label: 'Recipes', hint: 'Opens recipe ideas' },
  { value: 'voice_order', label: 'Voice order', hint: 'Opens voice ordering' },
  { value: 'budget', label: 'Budget planner', hint: 'Opens budget dashboard' },
  { value: 'utilities', label: 'Utilities hub', hint: 'Recipes, budget, returns, etc.' },
  { value: 'feedback', label: 'Feedback', hint: 'Opens customer feedback page' },
  { value: 'custom', label: 'Custom URL', hint: 'Your own path or https:// link' },
];

export function clampHomePromoIntervalSeconds(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.min(HOME_PROMO_INTERVAL_MAX_SEC, Math.max(HOME_PROMO_INTERVAL_MIN_SEC, Math.round(n)));
}
