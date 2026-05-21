import React, { memo } from 'react';
import CachedImage from '../../ui/CachedImage';
import { POSProduct } from '../../../types/pos';
import {
    formatPosProductPrice,
    getPosStockBadge,
    POS_CARD_IMAGE_HEIGHT,
    POS_CARD_IMAGE_HEIGHT_DENSE,
    PosStockBadgeVariant,
} from './posProductCardUtils';

const STOCK_BADGE_CLASSES: Record<PosStockBadgeVariant, string> = {
    'in-stock':
        'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    'low-stock':
        'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    'out-of-stock':
        'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    expired:
        'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    reserved:
        'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
};

export type ProductCardProps = {
    product: POSProduct;
    isSelected?: boolean;
    isDenseMode?: boolean;
    compact?: boolean;
    onClick: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
};

function ProductCardInner({
    product,
    isSelected = false,
    isDenseMode = false,
    compact = false,
    onClick,
    onContextMenu,
}: ProductCardProps) {
    const outOfStock = product.stockLevel <= 0;
    const priceText = formatPosProductPrice(product.price);
    const stockBadge = getPosStockBadge(product);
    const imageHeight = isDenseMode || compact ? POS_CARD_IMAGE_HEIGHT_DENSE : POS_CARD_IMAGE_HEIGHT;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={outOfStock}
            onContextMenu={onContextMenu}
            aria-label={`${product.name}, ${priceText}, ${stockBadge.label}`}
            className={[
                'pos-product-card group relative flex h-full w-full min-h-0 flex-col overflow-hidden text-left',
                'rounded-2xl border border-slate-200/90 bg-white p-0',
                'shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 ease-out',
                'dark:border-slate-700 dark:bg-slate-800 dark:shadow-none',
                outOfStock
                    ? 'cursor-not-allowed opacity-[0.72] grayscale'
                    : 'hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.10)] active:scale-[0.98] dark:hover:border-blue-500/40',
                isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : '',
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <div
                className="relative w-full shrink-0 overflow-hidden rounded-t-2xl bg-[#f8fafc] dark:bg-slate-700/40"
                style={{ height: imageHeight }}
            >
                <CachedImage
                    path={product.imageUrl}
                    alt={product.name}
                    fallbackLabel={product.name}
                    fallbackClassName={
                        isDenseMode || compact
                            ? '!rounded-none !p-1 [&_span]:text-[6px] [&_span]:leading-tight [&_span]:line-clamp-2'
                            : '!rounded-none [&_span]:text-[7px]'
                    }
                    className={`block h-full w-full min-h-0 min-w-0 object-cover object-center transition-transform duration-300 ${
                        outOfStock ? '' : 'group-hover:scale-[1.04]'
                    }`}
                />
                {outOfStock ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/50 px-2 dark:bg-slate-900/50">
                        <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[6px] font-bold uppercase tracking-wide text-white">
                            Out of stock
                        </span>
                    </div>
                ) : null}
            </div>

            <div className="flex shrink-0 flex-col gap-0 px-2 pb-1.5 pt-1">
                <h3
                    className="line-clamp-2 min-w-0 text-[8px] font-semibold leading-[1.25] text-slate-800 dark:text-slate-100"
                    title={product.name}
                >
                    {product.name}
                </h3>

                <div className="flex items-end justify-between gap-1 pt-0.5">
                    <span
                        className={`font-bold tabular-nums text-blue-600 dark:text-blue-400 ${
                            compact ? 'text-[8px]' : 'text-[10px]'
                        }`}
                        title={priceText}
                    >
                        {priceText}
                    </span>
                    <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-semibold leading-none ${STOCK_BADGE_CLASSES[stockBadge.variant]}`}
                        title={stockBadge.title}
                    >
                        {stockBadge.label}
                    </span>
                </div>
            </div>
        </button>
    );
}

const ProductCard = memo(ProductCardInner);
export default ProductCard;
