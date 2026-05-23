/**
 * Compact home density tokens (4–10dp scale).
 * CSS mirrors these in :root under `.page--home` scope.
 */
export const COMPACT_HOME = {
  space: { xs: 4, sm: 6, md: 8, lg: 10 },
  category: {
    cardHeight: 68,
    iconSize: 20,
    fontSize: 11,
    minWidth: 52,
  },
  search: { height: 44, fontSize: 13 },
  header: { height: 52 },
  product: {
    rowCellWidth: 124,
    titleSize: 13,
    subtitleSize: 12,
    priceSize: 16,
    stockSize: 11,
    imageHeight: 72,
  },
  /** Promo carousel height follows slide image intrinsic size */
  banner: { intrinsicHeight: true },
} as const;
