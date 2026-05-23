import { CURRENCY } from '../../../constants';
import type { InventoryItem } from '../../../types/inventory';
import { POSProduct } from '../../../types/pos';

/** On-hand vs sellable at a branch. Handles warehouse ids that differ from branch ids (legacy receipts). */
export function computeBranchStockForPos(
    inv: InventoryItem | undefined,
    selectedBranchId: string | null
): {
    branchOnHand: number;
    branchSellable: number;
    onlyExpiredStock: boolean;
    branchFullyReserved: boolean;
} {
    if (!inv) {
        return { branchOnHand: 0, branchSellable: 0, onlyExpiredStock: false, branchFullyReserved: false };
    }
    const whStock = inv.warehouseStock || {};
    const whSell = inv.warehouseSellable || {};
    const whRes = inv.warehouseReserved || {};
    const hasWhSell = Object.keys(whSell).length > 0;
    const nWh = Object.keys(whStock).length;
    const aggSellable = Math.max(0, Number(inv.sellableOnHand ?? inv.available ?? 0));

    const branchOnHand = selectedBranchId
        ? Math.max(0, Number(whStock[selectedBranchId] ?? 0))
        : Math.max(0, Number(inv.onHand ?? 0));

    let branchReserved = 0;
    if (selectedBranchId != null && selectedBranchId !== '') {
        if (Object.prototype.hasOwnProperty.call(whRes, selectedBranchId)) {
            branchReserved = Math.max(0, Number(whRes[selectedBranchId]));
        } else if (
            Object.keys(whRes).length === 0 &&
            Object.keys(whStock).length === 1 &&
            Object.keys(whStock)[0] === selectedBranchId
        ) {
            branchReserved = Math.max(0, Number(inv.reserved ?? 0));
        }
    } else {
        branchReserved = Math.max(0, Number(inv.reserved ?? 0));
    }

    let branchSellable: number;
    if (!selectedBranchId) {
        branchSellable = aggSellable;
    } else if (hasWhSell) {
        branchSellable = Math.max(0, Number(whSell[selectedBranchId] ?? 0));
        if (branchSellable <= 0 && !Object.prototype.hasOwnProperty.call(whSell, selectedBranchId)) {
            const sellSum = Object.values(whSell).reduce((s, v) => s + (Number(v) || 0), 0);
            if (sellSum > 0 && (nWh === 1 || Math.abs(sellSum - aggSellable) < 1e-6)) {
                branchSellable = sellSum;
            }
        }
    } else if (nWh <= 1) {
        const oh = Math.max(0, Number(whStock[selectedBranchId] ?? inv.onHand ?? 0));
        branchSellable = Math.min(oh, aggSellable);
        if (branchSellable <= 0 && nWh === 1) {
            const onlyWh = Object.keys(whStock)[0];
            const whOh = Math.max(0, Number(whStock[onlyWh] ?? 0));
            if (whOh > 0) branchSellable = Math.min(whOh, aggSellable);
        }
    } else {
        branchSellable = Math.max(0, Number(whStock[selectedBranchId] ?? 0));
        if (branchSellable <= 0 && aggSellable > 0) {
            const stockSum = Object.values(whStock).reduce((s, v) => s + (Number(v) || 0), 0);
            if (stockSum > 0) branchSellable = Math.min(aggSellable, stockSum);
        }
    }

    const eps = 1e-6;
    const branchFullyReserved =
        branchOnHand > eps && branchSellable <= eps && branchReserved + eps >= branchOnHand;

    const onlyExpiredStock =
        branchOnHand > eps &&
        branchSellable <= eps &&
        !branchFullyReserved &&
        (hasWhSell || nWh <= 1);

    return { branchOnHand, branchSellable, onlyExpiredStock, branchFullyReserved };
}

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
