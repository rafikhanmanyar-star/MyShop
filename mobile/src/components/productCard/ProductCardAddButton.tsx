import { memo } from 'react';

type Props = {
    cartQty: number;
    maxOrderQty: number;
    canPurchase: boolean;
    unavailableStyle: boolean;
    onAddOne: () => void;
    onChangeQty: (quantity: number) => void;
};

/** Compact pill add button or inline qty stepper — touch-friendly min 28px height. */
function ProductCardAddButton({
    cartQty,
    maxOrderQty,
    canPurchase,
    unavailableStyle,
    onAddOne,
    onChangeQty,
}: Props) {
    const showStepper = cartQty > 0 && canPurchase && !unavailableStyle;

    if (showStepper) {
        return (
            <div className="qty-stepper qty-stepper--compact" role="group" aria-label="Quantity">
                <button
                    type="button"
                    className="qty-stepper__btn"
                    aria-label="Decrease quantity"
                    disabled={unavailableStyle}
                    onClick={() => onChangeQty(cartQty - 1)}
                >
                    −
                </button>
                <span className="qty-stepper__val">{cartQty}</span>
                <button
                    type="button"
                    className="qty-stepper__btn"
                    aria-label="Increase quantity"
                    disabled={unavailableStyle || cartQty >= maxOrderQty}
                    onClick={() => onChangeQty(cartQty + 1)}
                >
                    +
                </button>
            </div>
        );
    }

    return (
        <button
            type="button"
            className="product-card__add"
            disabled={unavailableStyle || !canPurchase}
            onClick={() => canPurchase && !unavailableStyle && onAddOne()}
        >
            {!canPurchase || unavailableStyle ? 'Unavailable' : '+ Add'}
        </button>
    );
}

export default memo(ProductCardAddButton);
