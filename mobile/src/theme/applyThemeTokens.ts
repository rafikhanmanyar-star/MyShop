import { darkTheme } from './darkTheme';
import { lightTheme, type ThemeTokens } from './lightTheme';
import type { ResolvedTheme } from './themeStorage';
import { fontCssVars, fontTokens } from './fontTokens';
import { spacingTokens } from './spacingTokens';
import { getProductCardCssVarValues } from './typography';
import { typographyTokens } from './typographyTokens';

/** Map token object → CSS custom properties on :root. */
export function applyThemeTokens(resolved: ResolvedTheme): ThemeTokens {
  const tokens = resolved === 'dark' ? darkTheme : lightTheme;
  if (typeof document === 'undefined') return tokens;

  const root = document.documentElement;
  const mode = resolved === 'dark' ? 'dark' : 'light';
  const productVars = getProductCardCssVarValues(mode);

  const map: Record<string, string> = {
    ...productVars,
    [fontCssVars.inter]: fontTokens.inter,
    [fontCssVars.urdu]: fontTokens.urdu,
    [fontCssVars.sans]: fontTokens.sans,
    '--bg': tokens.bg,
    '--bg-card': tokens.bgCard,
    '--bg-overlay': tokens.bgOverlay,
    '--surface-elevated': tokens.surfaceElevated,
    '--card-bg': tokens.bgCard,
    '--text': tokens.text,
    '--text-secondary': tokens.textSecondary,
    '--text-muted': tokens.textMuted,
    '--text-tertiary': tokens.textTertiary,
    '--border': tokens.border,
    '--border-light': tokens.borderLight,
    '--border-subtle': tokens.borderSubtle,
    '--shadow-sm': tokens.shadowSm,
    '--shadow': tokens.shadow,
    '--shadow-lg': tokens.shadowLg,
    '--shadow-xl': tokens.shadowXl,
    '--nav-bg': tokens.navBg,
    '--header-bg': tokens.headerBg,
    '--input-bg': tokens.inputBg,
    '--toast-bg': tokens.toastBg,
    '--toast-text': tokens.toastText,
    '--promo-overlay': tokens.promoOverlay,
    '--space-1': spacingTokens.space1,
    '--space-2': spacingTokens.space2,
    '--space-3': spacingTokens.space3,
    '--space-4': spacingTokens.space4,
    '--text-product-title': typographyTokens.productTitle,
    '--text-product-price': typographyTokens.productPrice,
    '--text-product-stock': typographyTokens.productStock,
    '--text-category': typographyTokens.category,
    '--text-search': typographyTokens.search,
    '--text-nav-label': typographyTokens.navLabel,
  };

  for (const [key, value] of Object.entries(map)) {
    root.style.setProperty(key, value);
  }

  return tokens;
}

export function getThemeTokens(resolved: ResolvedTheme): ThemeTokens {
  return resolved === 'dark' ? darkTheme : lightTheme;
}
