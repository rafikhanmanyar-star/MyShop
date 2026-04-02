import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import type { InventoryItem } from '../../types/inventory';
import ProductCard from './ProductCard';

type Props = {
  items: InventoryItem[];
  categories: string[];
  categoryId: string | 'all';
  onCategory: (id: string | 'all') => void;
  touchMode: boolean;
  onAdd: (item: InventoryItem) => void;
};

const COLS = 2;

export default function ProductPanel({ items, categories, categoryId, onCategory, touchMode, onAdd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  const rowCount = Math.ceil(items.length / COLS);
  const rowHeight = touchMode ? 132 : 108;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (h) setHeight(Math.max(200, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const Row = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const cells: React.ReactNode[] = [];
      for (let c = 0; c < COLS; c++) {
        const i = index * COLS + c;
        if (i < items.length) {
          const item = items[i];
          const stock =
            item.warehouseStock && Object.keys(item.warehouseStock).length
              ? Object.values(item.warehouseStock).reduce((a, b) => a + b, 0)
              : item.onHand;
          cells.push(
            <div key={item.id} className="box-border w-1/2 min-w-0 shrink-0 px-1.5 pb-3">
              <ProductCard item={item} stock={stock} touchMode={touchMode} onAdd={() => onAdd(item)} />
            </div>
          );
        } else {
          cells.push(<div key={`e-${c}`} className="w-1/2" />);
        }
      }
      return (
        <div style={style} className="flex px-2">
          {cells}
        </div>
      );
    },
    [items, onAdd, touchMode]
  );

  const listKey = useMemo(() => items.map((i) => i.id).join(','), [items]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white p-4 dark:bg-gray-900">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => onCategory('all')}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium touch-manipulation ${
            categoryId === 'all'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onCategory(cat)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium touch-manipulation ${
              categoryId === cat ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="min-h-0 flex-1">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">No products match</div>
        ) : (
          <FixedSizeList
            key={listKey}
            height={height}
            itemCount={rowCount}
            itemSize={rowHeight}
            width="100%"
            className="pos-scrollbar"
          >
            {Row}
          </FixedSizeList>
        )}
      </div>
    </div>
  );
}
