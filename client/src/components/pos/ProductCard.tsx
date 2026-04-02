import React from 'react';
import type { InventoryItem } from '../../types/inventory';

type Props = {
  item: InventoryItem;
  stock: number;
  touchMode: boolean;
  onAdd: () => void;
};

export default function ProductCard({ item, stock, touchMode, onAdd }: Props) {
  const pad = touchMode ? 'p-3' : 'p-2';
  return (
    <button
      type="button"
      onClick={onAdd}
      className={`flex w-full flex-col rounded-lg border border-gray-200 bg-white text-left shadow-sm transition hover:border-primary-400 hover:shadow dark:border-gray-700 dark:bg-gray-800 ${pad}`}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="mb-2 h-16 w-full rounded object-cover" />
      ) : null}
      <div className={`font-semibold leading-tight text-gray-900 dark:text-gray-100 ${touchMode ? 'text-base' : 'text-sm'}`}>
        {item.name}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="truncate">{item.sku}</span>
        <span className="shrink-0 font-mono text-gray-700 dark:text-gray-300">Stock {stock}</span>
      </div>
      <div className="mt-2 font-mono text-sm font-bold text-primary-700 dark:text-primary-400">
        {item.retailPrice.toFixed(2)}
      </div>
    </button>
  );
}
