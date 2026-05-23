import { memo } from 'react';
import type { StockStatus } from './productCardUtils';

type Props = {
    price: string;
    wasPrice?: string;
    stockLabel: string;
    stockStatus: StockStatus;
    outOfStock: boolean;
    /** Hide ratings row — compact cards */
    compact?: boolean;
};

const STOCK_CLASS: Record<StockStatus, string> = {
    in: 'product-card__stock--in',
    low: 'product-card__stock--low',
    out: 'product-card__stock--out',
    preorder: 'product-card__stock--preorder',
};

/** Price + stock stack for compact grocery cards. */
function ProductCardPriceSection({
    price,
    wasPrice,
    stockLabel,
    stockStatus,
    outOfStock,
    compact = true,
}: Props) {
    const stockClass = outOfStock ? STOCK_CLASS.out : STOCK_CLASS[stockStatus];

    return (
        <div className={`product-card__price-block ${compact ? 'product-card__price-block--compact' : ''}`}>
            <div className="product-card__price-row">
                {wasPrice ? <span className="price price--was product-card__was-price">{wasPrice}</span> : null}
                <span className="price price--dominant product-card__price">{price}</span>
            </div>
            <div className={`product-card__stock ${stockClass}`}>{stockLabel}</div>
        </div>
    );
}

export default memo(ProductCardPriceSection);
