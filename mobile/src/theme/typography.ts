import { fontTokens } from './fontTokens';
import { fontWeights } from './fontWeights';

/**
 * Product-card typography tokens — scoped to catalog cards only.
 * Values use clamp() for responsive scaling across phone / tablet widths.
 */
export const productCardTypography = {
  /** Inter Medium — English / Latin product title */
  productTitle: {
    fontFamily: fontTokens.inter,
    fontSize: 'clamp(12px, 0.28rem + 2.6vw, 13px)',
    fontWeight: fontWeights.medium,
    lineHeight: '16px',
    letterSpacing: '-0.02em',
    maxLines: 2,
  },
  /** Noto Sans Arabic Regular — Urdu subtitle / dual-language secondary line */
  productSubtitle: {
    fontFamily: fontTokens.urdu,
    fontSize: 'clamp(11px, 0.24rem + 2.2vw, 12px)',
    fontWeight: fontWeights.regular,
    lineHeight: '15px',
    letterSpacing: '0',
  },
  /** Inter Bold — sale price */
  productPrice: {
    fontFamily: fontTokens.inter,
    fontSize: 'clamp(15px, 0.32rem + 3vw, 16px)',
    fontWeight: fontWeights.bold,
    lineHeight: '18px',
    letterSpacing: '-0.03em',
  },
  /** Inter Regular — struck-through list price */
  productWasPrice: {
    fontFamily: fontTokens.inter,
    fontSize: 'clamp(11px, 0.22rem + 2vw, 12px)',
    fontWeight: fontWeights.regular,
    lineHeight: '14px',
    textDecoration: 'line-through',
  },
  /** Inter Medium — stock status line */
  stockText: {
    fontFamily: fontTokens.inter,
    fontSize: 'clamp(10px, 0.2rem + 1.8vw, 11px)',
    fontWeight: fontWeights.medium,
    lineHeight: '13px',
  },
  /** Inter SemiBold — compact add / qty controls */
  buttonText: {
    fontFamily: fontTokens.inter,
    fontSize: 'clamp(11px, 0.24rem + 2vw, 12px)',
    fontWeight: fontWeights.semiBold,
    lineHeight: '14px',
  },
} as const;

/** Semantic colors for product-card text (light defaults; dark overrides in CSS) */
export const productCardColors = {
  light: {
    title: '#2A2A2A',
    subtitle: '#666666',
    price: '#E53935',
    wasPrice: '#999999',
    stockIn: '#10B981',
    stockLow: '#F59E0B',
    stockOut: '#EF4444',
  },
  dark: {
    title: '#E8EAED',
    subtitle: '#94A3B8',
    price: '#FF6B6B',
    wasPrice: '#64748B',
    stockIn: '#34D399',
    stockLow: '#FBBF24',
    stockOut: '#F87171',
  },
} as const;

/** CSS custom property map — applied via applyThemeTokens + :root */
export const productCardCssVars = {
  titleSize: '--text-product-title',
  titleLh: '--text-product-title-lh',
  titleSpacing: '--text-product-title-spacing',
  subtitleSize: '--text-product-subtitle',
  subtitleLh: '--text-product-subtitle-lh',
  priceSize: '--text-product-price',
  priceSpacing: '--text-product-price-spacing',
  wasPriceSize: '--text-product-was-price',
  stockSize: '--text-product-stock',
  buttonSize: '--text-product-button',
  titleColor: '--product-title-color',
  subtitleColor: '--product-subtitle-color',
  priceColor: '--product-price-color',
  wasPriceColor: '--product-was-price-color',
  stockInColor: '--product-stock-in-color',
  stockLowColor: '--product-stock-low-color',
  stockOutColor: '--product-stock-out-color',
} as const;

/** Resolve CSS variable values for a theme mode */
export function getProductCardCssVarValues(mode: 'light' | 'dark') {
  const colors = productCardColors[mode];
  const t = productCardTypography;
  return {
    [productCardCssVars.titleSize]: t.productTitle.fontSize,
    [productCardCssVars.titleLh]: t.productTitle.lineHeight,
    [productCardCssVars.titleSpacing]: t.productTitle.letterSpacing,
    [productCardCssVars.subtitleSize]: t.productSubtitle.fontSize,
    [productCardCssVars.subtitleLh]: t.productSubtitle.lineHeight,
    [productCardCssVars.priceSize]: t.productPrice.fontSize,
    [productCardCssVars.priceSpacing]: t.productPrice.letterSpacing,
    [productCardCssVars.wasPriceSize]: t.productWasPrice.fontSize,
    [productCardCssVars.stockSize]: t.stockText.fontSize,
    [productCardCssVars.buttonSize]: t.buttonText.fontSize,
    [productCardCssVars.titleColor]: colors.title,
    [productCardCssVars.subtitleColor]: colors.subtitle,
    [productCardCssVars.priceColor]: colors.price,
    [productCardCssVars.wasPriceColor]: colors.wasPrice,
    [productCardCssVars.stockInColor]: colors.stockIn,
    [productCardCssVars.stockLowColor]: colors.stockLow,
    [productCardCssVars.stockOutColor]: colors.stockOut,
  } as Record<string, string>;
}

/**
 * Memoized inline style objects for rare JS-driven product-card text.
 * Prefer CSS classes in ProductListCard for scroll performance.
 */
export const productCardTextStyles = Object.freeze({
  productTitle: {
    fontFamily: productCardTypography.productTitle.fontFamily,
    fontWeight: productCardTypography.productTitle.fontWeight,
    letterSpacing: productCardTypography.productTitle.letterSpacing,
  },
  productSubtitle: {
    fontFamily: productCardTypography.productSubtitle.fontFamily,
    fontWeight: productCardTypography.productSubtitle.fontWeight,
  },
  productPrice: {
    fontFamily: productCardTypography.productPrice.fontFamily,
    fontWeight: productCardTypography.productPrice.fontWeight,
    letterSpacing: productCardTypography.productPrice.letterSpacing,
  },
  stockText: {
    fontFamily: productCardTypography.stockText.fontFamily,
    fontWeight: productCardTypography.stockText.fontWeight,
  },
  buttonText: {
    fontFamily: productCardTypography.buttonText.fontFamily,
    fontWeight: productCardTypography.buttonText.fontWeight,
  },
});
