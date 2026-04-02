import React, { memo } from 'react';
import type { InventoryItem } from '../../types/inventory';
import { CURRENCY } from '../../constants';

type Props = {
  item: InventoryItem;
  stock: number;
  onAdd: () => void;
  touchMode: boolean;
};

function ProductCardInner({ item, stock, onAdd, touchMode }: Props) {
  const disabled = stock <= 0;
  const low = stock > 0 && stock <= (item.reorderPoint || 10);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onAdd}
      className={`flex w-full flex-col rounded-lg border bg-white p-3 text-left transition-transform dark:bg-gray-900 ${
        touchMode ? 'min-h-[120px] py-3' : 'min-h-[96px]'
      } ${
        disabled
          ? 'cursor-not-allowed border-gray-100 opacity-50 dark:border-gray-800'
          : 'active:scale-[0.99] border-gray-200 dark:border-gray-700'
      } `}
    >
      <div className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
          {CURRENCY}
          {(Number(item.retailPrice) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-bold ${
            disabled
              ? 'bg-gray-800 text-white'
              : low
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          }`}
        >
          {disabled ? 'Out' : `${stock}`}
        </span>
      </div>
    </button>
  );
}

const ProductCard = memo(ProductCardInner);
export default ProductCard;
