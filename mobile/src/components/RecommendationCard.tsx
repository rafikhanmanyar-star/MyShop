import { memo } from 'react';
import ProductListCard, { type ProductListProduct } from './ProductListCard';

type Props = {
    product: ProductListProduct;
    shopSlug: string;
    cartQty: number;
    formatPrice: (p: number | string | null | undefined) => string;
    onAddOne: (product: ProductListProduct) => void;
    onChangeQty: (productId: string, quantity: number) => void;
};

/** PDP / recommendation rail — reuses compact ProductListCard for consistent grocery UI. */
function RecommendationCard(props: Props) {
    return <ProductListCard {...props} density="compact" layout="rail" />;
}

export default memo(RecommendationCard);
