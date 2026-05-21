import React, { memo, useMemo } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { POSProduct } from '../../../types/pos';
import ProductCard from './ProductCard';
import { getPosCatalogRowHeight, POS_CATALOG_GRID_GAP_PX } from './posProductCardUtils';

export type ProductGridItemData = {
    products: POSProduct[];
    columnCount: number;
    keyboardIndex: number;
    isDenseMode: boolean;
    addToCart: (product: POSProduct) => void;
    onProductContextMenu: (e: React.MouseEvent, product: POSProduct) => void;
};

/** Stable row renderer — must stay outside parent components to avoid list blink on cart updates. */
export const ProductGridRow = memo(function ProductGridRow({
    index,
    style,
    data,
}: ListChildComponentProps<ProductGridItemData>) {
    const { products, columnCount, keyboardIndex, isDenseMode, addToCart, onProductContextMenu } = data;
    const cells: React.ReactNode[] = [];

    for (let col = 0; col < columnCount; col++) {
        const itemIndex = index * columnCount + col;
        if (itemIndex >= products.length) {
            cells.push(<div key={`empty-${col}`} className="min-w-0" aria-hidden />);
            continue;
        }
        const product = products[itemIndex];
        const isSelected = keyboardIndex === itemIndex;
        const outOfStock = product.stockLevel <= 0;

        cells.push(
            <div key={product.id} className="min-h-0 min-w-0" onContextMenu={(e) => onProductContextMenu(e, product)}>
                <ProductCard
                    product={product}
                    isSelected={isSelected}
                    isDenseMode={isDenseMode}
                    onClick={() => {
                        if (!outOfStock) addToCart(product);
                    }}
                />
            </div>
        );
    }

    return (
        <div
            style={{
                ...style,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: POS_CATALOG_GRID_GAP_PX,
                paddingLeft: 14,
                paddingRight: 14,
                boxSizing: 'border-box',
            }}
            className="min-h-0 overflow-hidden"
        >
            {cells}
        </div>
    );
});

type ProductGridProps = {
    products: POSProduct[];
    columnCount: number;
    height: number;
    keyboardIndex: number;
    isDenseMode: boolean;
    listRef: React.RefObject<FixedSizeList>;
    addToCart: (product: POSProduct) => void;
    onProductContextMenu: (e: React.MouseEvent, product: POSProduct) => void;
};

export default function ProductGrid({
    products,
    columnCount,
    height,
    keyboardIndex,
    isDenseMode,
    listRef,
    addToCart,
    onProductContextMenu,
}: ProductGridProps) {
    const rowCount = Math.ceil(products.length / columnCount);
    const rowHeight = getPosCatalogRowHeight(isDenseMode);

    const itemData = useMemo(
        (): ProductGridItemData => ({
            products,
            columnCount,
            keyboardIndex,
            isDenseMode,
            addToCart,
            onProductContextMenu,
        }),
        [products, columnCount, keyboardIndex, isDenseMode, addToCart, onProductContextMenu]
    );

    if (products.length === 0) return null;

    return (
        <FixedSizeList
            ref={listRef}
            height={height}
            itemCount={rowCount}
            itemSize={rowHeight}
            width="100%"
            className="pos-scrollbar pos-product-grid-list"
            itemData={itemData}
        >
            {ProductGridRow}
        </FixedSizeList>
    );
}
