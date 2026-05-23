import { memo } from 'react';

type Props = {
    price: string;
    wasPrice?: string;
    stockLabel: string;
    outOfStock: boolean;
    /** Hide ratings row — compact cards */
    compact?: boolean;
};

/** Price + stock stack for compact grocery cards. */
function ProductCardPriceSection({ price, wasPrice, stockLabel, outOfStock, compact = true }: Props) {
    return (
        <div className={`product-card__price-block ${compact ? 'product-card__price-block--compact' : ''}`}>
            <div className="product-card__price-row">
                {wasPrice ? <span className="price price--was">{wasPrice}</span> : null}
                <span className="price price--dominant">{price}</span>
            </div>
            <div className={`product-card__stock ${outOfStock ? 'product-card__stock--out' : ''}`}>
                {stockLabel}
            </div>
        </div>
    );
}

export default memo(ProductCardPriceSection);
