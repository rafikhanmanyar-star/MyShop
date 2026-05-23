/** Compact spacing scale (dp-equivalent px) for browse catalog */
export const COMPACT_SPACE = {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
} as const;

/** Breakpoints for responsive product grid columns */
const TABLET_BP = 640;
const LARGE_TABLET_BP = 900;

/**
 * Returns column count for the browse product grid.
 * Mobile: 3 | Tablet: 4 | Large tablet: 5
 */
export function computeCatalogColumnCount(viewportWidth: number): number {
    if (viewportWidth >= LARGE_TABLET_BP) return 5;
    if (viewportWidth >= TABLET_BP) return 4;
    return 3;
}

/**
 * Estimated virtualized row height (px) tuned for compact product cards.
 * Used by @tanstack/react-virtual for smooth scroll positioning.
 */
export function estimateCatalogRowHeight(columnCount: number): number {
    switch (columnCount) {
        case 5:
            return 200;
        case 4:
            return 215;
        case 2:
            return 260;
        default:
            return 228;
    }
}
