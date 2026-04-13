import { useWindowVirtualizer } from '@tanstack/react-virtual';

const COLS = 2;
const EST_ROW = 320;

type Props = {
    items: { id: string }[];
    renderCard: (product: any) => React.ReactNode;
};

/**
 * Two-column grid with window-based virtualization for long product lists.
 */
export default function VirtualizedProductGrid({ items, renderCard }: Props) {
    const rowCount = Math.ceil(items.length / COLS);

    const rowVirtualizer = useWindowVirtualizer({
        count: rowCount,
        estimateSize: () => EST_ROW,
        overscan: 4,
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
        >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const start = virtualRow.index * COLS;
                const rowItems = items.slice(start, start + COLS);
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
                        <div className="product-grid product-grid--browse">
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
