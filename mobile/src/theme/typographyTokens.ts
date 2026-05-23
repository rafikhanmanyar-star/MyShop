/**
 * Centralized product-card typography tokens (legacy re-export).
 * Prefer importing from `./typography` for new product-card work.
 */
export {
  productCardTypography,
  productCardColors,
  productCardCssVars,
  productCardTextStyles,
  getProductCardCssVarValues,
} from './typography';

export { fontTokens, fontCssVars } from './fontTokens';
export { fontWeights } from './fontWeights';

/** Shell / catalog typography sizes — non–product-card UI */
export const typographyTokens = {
  fontFamily: "'Inter', 'Roboto', system-ui, -apple-system, sans-serif",
  productTitle: 'clamp(12px, 0.28rem + 2.6vw, 13px)',
  productPrice: 'clamp(15px, 0.32rem + 3vw, 16px)',
  productStock: 'clamp(10px, 0.2rem + 1.8vw, 11px)',
  category: '11px',
  search: '13px',
  navLabel: '10px',
  pageTitle: '22px',
  body: '14px',
  bodySmall: '13px',
} as const;
