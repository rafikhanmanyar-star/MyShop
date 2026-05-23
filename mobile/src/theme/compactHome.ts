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
    rowCellWidth: 118,
    titleSize: 11,
    priceSize: 12,
    stockSize: 10,
    imageHeight: 72,
  },
  banner: { maxHeight: 128, aspectRatio: '2.4 / 1' },
} as const;
