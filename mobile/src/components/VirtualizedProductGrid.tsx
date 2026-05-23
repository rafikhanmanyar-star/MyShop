import { memo, useEffect, useState, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    computeCatalogColumnCount,
    estimateCatalogRowHeight,
} from '../utils/catalogGridColumns';

type Props = {
    items: { id: string }[];
    renderCard: (product: { id: string }) => React.ReactNode;
    scrollElementRef: RefObject<HTMLDivElement | null>;
};

function useCatalogColumnCount(): number {
    const [cols, setCols] = useState(() =>
        typeof window !== 'undefined' ? computeCatalogColumnCount(window.innerWidth) : 3,
    );

    useEffect(() => {
        const onResize = () => setCols(computeCatalogColumnCount(window.innerWidth));
        window.addEventListener('resize', onResize, { passive: true });
        return () => window.removeEventListener('resize', onResize);
    }, []);

    return cols;
}

function VirtualizedProductGrid({ items, renderCard, scrollElementRef }: Props) {
    const cols = useCatalogColumnCount();
    const rowCount = Math.ceil(items.length / cols);
    const estRow = estimateCatalogRowHeight(cols);

    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollElementRef.current,
        estimateSize: () => estRow,
        overscan: 3,
    });

    if (items.length === 0) return null;

    return (
        <div
            className="virtual-product-grid-root"
            style={{
                position: 'relative',
                width: '100%',
                height: rowVirtualizer.getTotalSize(),
            }}
            data-cols={cols}
        >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const start = virtualRow.index * cols;
                const rowItems = items.slice(start, start + cols);
                return (
                    <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                        }}
                    >
                        <div
                            className="product-grid product-grid--browse"
                            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                            data-cols={cols}
                        >
                            {rowItems.map((p) => (
                                <div key={p.id} className="virtual-product-grid__cell">
                                    {renderCard(p)}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default memo(VirtualizedProductGrid);
