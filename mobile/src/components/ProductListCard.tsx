import { memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProductImagePath } from '../api';
import ProductImage from './productCard/ProductImage';
import ProductCardAddButton from './productCard/ProductCardAddButton';
import ProductCardPriceSection from './productCard/ProductCardPriceSection';
import {
    getProductStock,
    getProductVariantLabel,
    originalListPrice,
    stockLabel as buildStockLabel,
} from './productCard/productCardUtils';

export type ProductListProduct = {
    id: string;
    name: string;
    price: number;
    available_stock?: number;
    stock?: number;
    image_url?: string | null;
    imageUrl?: string | null;
    image?: string | null;
    is_pre_order?: boolean;
    is_on_sale?: boolean;
    discount_percentage?: number;
    is_low_stock?: boolean;
    is_out_of_stock?: boolean;
    tax_rate?: number | string;
    sku?: string;
    unit?: string | null;
    size?: string | number | null;
    weight?: string | number | null;
    weight_unit?: string | null;
    rating_avg?: number;
    rating_count?: number;
    total_sales?: number;
    list_price?: number;
    original_price?: number;
};

type Props = {
    product: ProductListProduct;
    shopSlug: string;
    cartQty: number;
    formatPrice: (p: number | string | null | undefined) => string;
    /** Grey out + disable add (out of stock row when showing unavailable) */
    unavailableStyle?: boolean;
    /** `compact` — home rails & browse grid (high density). */
    density?: 'default' | 'compact';
    /** `grid` — catalog grid; `rail` — horizontal PDP/home scroll cells */
    layout?: 'grid' | 'rail';
    onAddOne: (product: ProductListProduct) => void;
    onChangeQty: (productId: string, quantity: number) => void;
    isFavorite?: boolean;
    onToggleFavorite?: (productId: string) => void;
};

function ProductListCard({
    product: p,
    shopSlug,
    cartQty,
    formatPrice,
    unavailableStyle = false,
    density = 'default',
    layout = 'grid',
    onAddOne,
    onChangeQty,
    isFavorite = false,
    onToggleFavorite,
}: Props) {
    const navigate = useNavigate();
    const suppressClick = useRef(false);
    const stock = getProductStock(p);
    const canPurchase = stock > 0 || Boolean(p.is_pre_order);
    const maxOrderQty = stock > 0 ? stock : p.is_pre_order ? 99 : 0;

    const openDetail = () => {
        suppressClick.current = true;
        navigate(`/${shopSlug}/products/${p.id}`);
        window.setTimeout(() => {
            suppressClick.current = false;
        }, 400);
    };

    const handleCardClick = () => {
        if (suppressClick.current) return;
        openDetail();
    };

    const imgPath = getProductImagePath(p);
    const variantLabel = getProductVariantLabel(p);
    const orig = originalListPrice(p);
    const label = buildStockLabel(p, stock, unavailableStyle);
    const outOfStock = stock <= 0 && !p.is_pre_order;

    const densityClass = density === 'compact' ? 'product-card--density-compact' : '';
    const layoutClass = layout === 'rail' ? 'product-card--rail' : '';

    return (
        <div
            className={`product-card product-card--list product-card--v2 ${densityClass} ${layoutClass} ${unavailableStyle ? 'product-card--unavailable' : ''}`}
            role="button"
            tabIndex={0}
            onClick={handleCardClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick();
                }
            }}
        >
            <div className="product-card__media">
                {onToggleFavorite ? (
                    <button
                        type="button"
                        className={`product-card__fav ${isFavorite ? 'product-card__fav--on' : ''}`}
                        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(p.id);
                        }}
                    >
                        {isFavorite ? '♥' : '♡'}
                    </button>
                ) : null}
                {p.is_on_sale && (p.discount_percentage ?? 0) > 0 && (
                    <div className="discount-badge discount-badge--card">
                        -{Math.round(Number(p.discount_percentage))}%
                    </div>
                )}
                <ProductImage path={imgPath} alt={p.name} layout={layout} />
            </div>

            <div className="product-card__body">
                <div className="product-card__name">{p.name}</div>
                {variantLabel ? <div className="product-card__variant">{variantLabel}</div> : null}

                <ProductCardPriceSection
                    price={formatPrice(p.price)}
                    wasPrice={orig != null && orig > p.price ? formatPrice(orig) : undefined}
                    stockLabel={label}
                    outOfStock={outOfStock}
                />

                {(Number(p.rating_avg) > 0 || Number(p.total_sales) > 0) && density !== 'compact' ? (
                    <div className="product-card__meta">
                        {Number(p.rating_avg) > 0 ? (
                            <span>
                                ★ {Number(p.rating_avg).toFixed(1)}
                                {Number(p.rating_count) > 0
                                    ? ` (${Number(p.rating_count).toLocaleString()})`
                                    : ''}
                            </span>
                        ) : null}
                        {Number(p.total_sales) > 0 ? (
                            <span>
                                {Number(p.total_sales) >= 1000
                                    ? `${(Number(p.total_sales) / 1000).toFixed(1)}k`
                                    : Number(p.total_sales)}{' '}
                                sold
                            </span>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <div
                className="product-card__actions"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <ProductCardAddButton
                    cartQty={cartQty}
                    maxOrderQty={maxOrderQty}
                    canPurchase={canPurchase}
                    unavailableStyle={unavailableStyle}
                    onAddOne={() => onAddOne(p)}
                    onChangeQty={(q) => onChangeQty(p.id, q)}
                />
            </div>
        </div>
    );
}

/** Memoized to avoid re-renders during scroll when unrelated parent state changes. */
export default memo(ProductListCard, (prev, next) =>
    prev.product.id === next.product.id &&
    prev.cartQty === next.cartQty &&
    prev.unavailableStyle === next.unavailableStyle &&
    prev.density === next.density &&
    prev.layout === next.layout &&
    prev.isFavorite === next.isFavorite &&
    prev.product.price === next.product.price &&
    prev.product.name === next.product.name &&
    getProductStock(prev.product) === getProductStock(next.product),
);
