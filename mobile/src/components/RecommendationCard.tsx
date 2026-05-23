import { memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CachedImage from './CachedImage';
import { getProductImagePath } from '../api';
import type { ProductListProduct } from './ProductListCard';

type Props = {
    product: ProductListProduct;
    shopSlug: string;
    cartQty: number;
    formatPrice: (p: number | string | null | undefined) => string;
    onAddOne: (product: ProductListProduct) => void;
    onChangeQty: (productId: string, quantity: number) => void;
};

function getStock(p: ProductListProduct): number {
    const s = p.stock ?? p.available_stock ?? 0;
    return typeof s === 'string' ? parseFloat(s) || 0 : s;
}

/** Compact horizontal-scroll card — matches browse page density for PDP recommendations. */
function RecommendationCard({ product: p, shopSlug, cartQty, formatPrice, onAddOne, onChangeQty }: Props) {
    const navigate = useNavigate();
    const suppressClick = useRef(false);
    const stock = getStock(p);
    const canPurchase = stock > 0 || Boolean(p.is_pre_order);
    const maxOrderQty = stock > 0 ? stock : p.is_pre_order ? 99 : 0;
    const showStepper = cartQty > 0 && canPurchase;

    const openDetail = () => {
        suppressClick.current = true;
        navigate(`/${shopSlug}/products/${p.id}`);
        window.setTimeout(() => {
            suppressClick.current = false;
        }, 400);
    };

    const imgPath = getProductImagePath(p);

    return (
        <div
            className="pdp-rec-card"
            role="button"
            tabIndex={0}
            onClick={() => {
                if (!suppressClick.current) openDetail();
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDetail();
                }
            }}
        >
            <div className="pdp-rec-card__img">
                <CachedImage path={imgPath} alt={p.name} loading="lazy" fallbackLabel={p.name} />
            </div>
            <div className="pdp-rec-card__name">{p.name}</div>
            <div className="pdp-rec-card__price">{formatPrice(p.price)}</div>
            <div
                className="pdp-rec-card__actions"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {showStepper ? (
                    <div className="pdp-rec-card__stepper" role="group" aria-label="Quantity">
                        <button
                            type="button"
                            className="pdp-rec-card__stepper-btn"
                            aria-label="Decrease"
                            onClick={() => onChangeQty(p.id, cartQty - 1)}
                        >
                            −
                        </button>
                        <span className="pdp-rec-card__stepper-val">{cartQty}</span>
                        <button
                            type="button"
                            className="pdp-rec-card__stepper-btn"
                            aria-label="Increase"
                            disabled={cartQty >= maxOrderQty}
                            onClick={() => onChangeQty(p.id, cartQty + 1)}
                        >
                            +
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="pdp-rec-card__add"
                        disabled={!canPurchase}
                        onClick={() => canPurchase && onAddOne(p)}
                    >
                        {canPurchase ? '+ Add' : 'N/A'}
                    </button>
                )}
            </div>
        </div>
    );
}

export default memo(RecommendationCard, (prev, next) =>
    prev.product.id === next.product.id &&
    prev.cartQty === next.cartQty &&
    prev.product.price === next.product.price &&
    prev.product.name === next.product.name &&
    getStock(prev.product) === getStock(next.product)
);
