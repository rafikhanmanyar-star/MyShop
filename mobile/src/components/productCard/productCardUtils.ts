import type { ProductListProduct } from '../ProductListCard';

/** Normalize stock from API variants. */
export function getProductStock(p: ProductListProduct): number {
    const s = p.stock ?? p.available_stock ?? 0;
    return typeof s === 'string' ? parseFloat(s) || 0 : s;
}

/** Weight / unit / size line for compact cards (e.g. "500g", "1 L"). */
export function getProductVariantLabel(p: ProductListProduct): string | null {
    const size = p.size != null ? String(p.size).trim() : '';
    if (size) return size;

    const unit = p.unit != null ? String(p.unit).trim() : '';
    if (unit) return unit;

    const weight = p.weight;
    const weightUnit = p.weight_unit != null ? String(p.weight_unit).trim() : '';
    if (weight != null && weight !== '') {
        const w = String(weight).trim();
        return weightUnit ? `${w}${weightUnit}` : w;
    }

    const sku = p.sku != null ? String(p.sku).trim() : '';
    if (sku && sku.length <= 16) return sku;

    return null;
}

export type ImageFitMode = 'contain' | 'contain-boost' | 'cover';

/**
 * Picks CSS fit strategy from intrinsic dimensions and file type.
 * Portrait/square/transparency → contain with slight scale-up; wide → cover crop.
 */
export function resolveImageFitMode(
    naturalWidth: number,
    naturalHeight: number,
    path?: string,
): ImageFitMode {
    if (!naturalWidth || !naturalHeight) return 'contain-boost';

    const lower = (path ?? '').toLowerCase();
    if (lower.endsWith('.png') || lower.includes('.png?')) {
        return 'contain-boost';
    }

    const ratio = naturalWidth / naturalHeight;
    if (ratio >= 1.35) return 'cover';
    if (ratio <= 0.92) return 'contain-boost';
    return 'contain-boost';
}

export type StockStatus = 'in' | 'low' | 'out' | 'preorder';

export function getStockStatus(
    p: ProductListProduct,
    stock: number,
    unavailableStyle: boolean,
): StockStatus {
    if (unavailableStyle && p.is_out_of_stock !== false && stock <= 0 && !p.is_pre_order) {
        return 'out';
    }
    if (p.is_pre_order && stock <= 0) return 'preorder';
    if (stock <= 0) return 'out';
    if (p.is_low_stock === true || (stock > 0 && stock <= 5)) return 'low';
    return 'in';
}

export function stockLabel(
    p: ProductListProduct,
    stock: number,
    unavailableStyle: boolean,
): string {
    if (unavailableStyle && p.is_out_of_stock !== false && stock <= 0 && !p.is_pre_order) {
        return 'Out of stock';
    }
    if (p.is_pre_order && stock <= 0) return 'Pre-order';
    if (stock <= 0) return 'Out of stock';
    if (p.is_low_stock === true || (stock > 0 && stock <= 5)) {
        return `Only ${Math.floor(stock)} left`;
    }
    return 'In Stock';
}

export function originalListPrice(p: ProductListProduct): number | undefined {
    if (p.original_price != null && p.original_price > p.price) return p.original_price;
    if (p.is_on_sale && (p.list_price ?? 0) > p.price) return p.list_price;
    return undefined;
}
