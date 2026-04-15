import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CachedImage from './CachedImage';
import { getProductImagePath } from '../api';
import { useLongPress } from '../hooks/useLongPress';

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
};

type Props = {
    product: ProductListProduct;
    shopSlug: string;
    cartQty: number;
    formatPrice: (p: number | string | null | undefined) => string;
    /** Grey out + disable add (out of stock row when showing unavailable) */
    unavailableStyle?: boolean;
    onAddOne: (product: ProductListProduct) => void;
    onChangeQty: (productId: string, quantity: number) => void;
};

function getStock(p: ProductListProduct): number {
    const s = p.stock ?? p.available_stock ?? 0;
    return typeof s === 'string' ? parseFloat(s) || 0 : s;
}

export default function ProductListCard({
    product: p,
    shopSlug,
    cartQty,
    formatPrice,
    unavailableStyle = false,
    onAddOne,
    onChangeQty,
}: Props) {
    const navigate = useNavigate();
    const suppressClick = useRef(false);
    const stock = getStock(p);
    const canPurchase = stock > 0 || Boolean(p.is_pre_order);
    const maxOrderQty = stock > 0 ? stock : p.is_pre_order ? 99 : 0;
    const showStepper = cartQty > 0 && canPurchase && !unavailableStyle;

    const openDetail = () => {
        suppressClick.current = true;
        navigate(`/${shopSlug}/products/${p.id}`);
        window.setTimeout(() => {
            suppressClick.current = false;
        }, 400);
    };

    const longPress = useLongPress(openDetail, 500);

    const handleCardClick = () => {
        if (suppressClick.current) return;
        if (unavailableStyle || !canPurchase) return;
        onAddOne(p);
    };

    const imgPath = getProductImagePath(p);

    const stockLabel = () => {
        if (unavailableStyle && p.is_out_of_stock !== false && stock <= 0 && !p.is_pre_order) {
            return 'Out of stock';
        }
        if (p.is_pre_order && stock <= 0) {
            return 'Pre-order';
        }
        if (stock <= 0) return 'Out of stock';
        if (p.is_low_stock === true || (stock > 0 && stock <= 5)) {
            return `Only ${Math.floor(stock)} left`;
        }
        return 'In Stock';
    };

    return (
        <div
            className={`product-card product-card--list ${unavailableStyle ? 'product-card--unavailable' : ''}`}
            role="button"
            tabIndex={0}
            onClick={handleCardClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick();
                }
            }}
            {...longPress}
        >
            {p.is_on_sale && (p.discount_percentage ?? 0) > 0 && (
                <div className="discount-badge">-{Math.round(Number(p.discount_percentage))}%</div>
            )}
            <div className="image-wrap image-wrap--list">
                <CachedImage path={imgPath} alt={p.name} loading="lazy" fallbackLabel={p.name} />
            </div>
            <div className="info">
                <div className="name">{p.name}</div>
                <div className="price price--dominant">{formatPrice(p.price)}</div>
                <div
                    className={`stock-line ${stock <= 0 && !p.is_pre_order ? 'out' : ''}`}
                >
                    {stockLabel()}
                </div>
            </div>

            <div
                className="product-card__actions"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {showStepper ? (
                    <div className="qty-stepper" role="group" aria-label="Quantity">
                        <button
                            type="button"
                            className="qty-stepper__btn"
                            aria-label="Decrease quantity"
                            disabled={unavailableStyle}
                            onClick={() => onChangeQty(p.id, cartQty - 1)}
                        >
                            −
                        </button>
                        <span className="qty-stepper__val">{cartQty}</span>
                        <button
                            type="button"
                            className="qty-stepper__btn"
                            aria-label="Increase quantity"
                            disabled={unavailableStyle || cartQty >= maxOrderQty}
                            onClick={() => onChangeQty(p.id, cartQty + 1)}
                        >
                            +
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="add-btn add-btn--compact"
                        disabled={unavailableStyle || !canPurchase}
                        onClick={() => canPurchase && !unavailableStyle && onAddOne(p)}
                    >
                        {!canPurchase || unavailableStyle ? 'Unavailable' : '+ Add'}
                    </button>
                )}
            </div>
        </div>
    );
}
