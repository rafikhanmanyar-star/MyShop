import { CURRENCY } from '../../../constants';
import { POSProduct } from '../../../types/pos';

export const POS_CATALOG_MIN_CARD_WIDTH = 160;
export const POS_CATALOG_GRID_GAP_PX = 14;
export const POS_CARD_IMAGE_HEIGHT = 120;
export const POS_CARD_IMAGE_HEIGHT_DENSE = 96;
/** ~2 lines at 8px / 1.25 line-height for virtualized row sizing */
export const POS_CARD_TITLE_MIN_HEIGHT = 20;
export const POS_CARD_TITLE_MIN_HEIGHT_DENSE = 17;

export type PosStockBadgeVariant = 'in-stock' | 'low-stock' | 'out-of-stock' | 'expired' | 'reserved';

export type PosStockBadge = {
    label: string;
    variant: PosStockBadgeVariant;
    title?: string;
};

export function formatPosProductPrice(amount: number): string {
    const n = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${CURRENCY} ${n}`;
}

export function getPosStockBadge(product: POSProduct): PosStockBadge {
    if (product.onlyExpiredStock && product.onHandAtBranch != null) {
        return {
            label: 'Expired',
            variant: 'expired',
            title: 'Only expired batches at this branch — not sellable',
        };
    }
    if (product.branchFullyReserved && product.onHandAtBranch != null) {
        return {
            label: 'Reserved',
            variant: 'reserved',
            title: 'Reserved for mobile — sellable quantity shown',
        };
    }
    if (product.stockLevel <= 0) {
        return { label: 'Out of Stock', variant: 'out-of-stock' };
    }
    const rp = product.reorderPoint ?? 10;
    if (product.stockLevel <= rp) {
        return {
            label: `Low · ${product.stockLevel}`,
            variant: 'low-stock',
            title: `Only ${product.stockLevel} unit${product.stockLevel === 1 ? '' : 's'} left`,
        };
    }
    return {
        label: `In Stock · ${product.stockLevel}`,
        variant: 'in-stock',
        title: `${product.stockLevel} units available`,
    };
}

/** Row height for react-window (image + padding + title + footer + gaps). */
export function getPosCatalogRowHeight(isDense: boolean): number {
    const imageH = isDense ? POS_CARD_IMAGE_HEIGHT_DENSE : POS_CARD_IMAGE_HEIGHT;
    const titleH = isDense ? POS_CARD_TITLE_MIN_HEIGHT_DENSE : POS_CARD_TITLE_MIN_HEIGHT;
    const padding = isDense ? 10 : 12;
    const footer = isDense ? 14 : 16;
    const gaps = 1;
    return imageH + padding + titleH + footer + gaps + 14;
}

export function computePosCatalogColumnCount(containerWidth: number): number {
    if (containerWidth <= 0) return 3;
    const cols = Math.floor(
        (containerWidth + POS_CATALOG_GRID_GAP_PX) / (POS_CATALOG_MIN_CARD_WIDTH + POS_CATALOG_GRID_GAP_PX)
    );
    return Math.max(2, Math.min(7, cols));
}
