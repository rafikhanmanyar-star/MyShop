/**
 * Font family stacks for product cards.
 * Inter (Latin) + Noto Sans Arabic (Urdu) with system fallbacks for fast first paint.
 */
export const fontTokens = {
  /** Primary UI / product titles, prices, buttons */
  inter: "'Inter', 'Roboto', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  /** Urdu / Arabic script product names */
  urdu: "'Noto Sans Arabic', 'Roboto', system-ui, -apple-system, sans-serif",
  /** App shell default — unchanged outside product cards */
  sans: "'Inter', 'Roboto', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

/** CSS custom property names injected at runtime */
export const fontCssVars = {
  inter: '--font-inter',
  urdu: '--font-urdu',
  sans: '--font',
} as const;
