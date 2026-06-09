/** Modern bottom nav layout + motion tokens (mirrors index.css custom properties). */
export const bottomNavTokens = {
  barHeight: 78,
  barRadius: 30,
  outerPaddingX: 12,
  outerPaddingY: 10,
  buttonRadius: 20,
  iconSize: 26,
  labelSize: 10,
  animationMs: 250,
  activeLiftPx: 6,
  activeScale: 1.08,
  inactiveScale: 0.94,
} as const;

export const bottomNavGradients = {
  home: { from: '#EF4444', to: '#F97316', glow: 'rgba(239, 68, 68, 0.45)' },
  browse: { from: '#3B82F6', to: '#06B6D4', glow: 'rgba(59, 130, 246, 0.45)' },
  offers: { from: '#22C55E', to: '#A3E635', glow: 'rgba(34, 197, 94, 0.45)' },
  cart: { from: '#EAB308', to: '#F97316', glow: 'rgba(234, 179, 8, 0.45)' },
  orders: { from: '#A855F7', to: '#7C3AED', glow: 'rgba(168, 85, 247, 0.45)' },
  utils: { from: '#14B8A6', to: '#06B6D4', glow: 'rgba(20, 184, 166, 0.45)' },
} as const;
