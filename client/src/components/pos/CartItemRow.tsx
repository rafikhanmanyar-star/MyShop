import React, { memo } from 'react';
import type { CartLine } from './posReducer';
import { CURRENCY } from '../../constants';

type Props = {
  line: CartLine;
  selected: boolean;
  flash: boolean;
  onQty: (lineId: string, q: number) => void;
  onRemove: (lineId: string) => void;
  onSelect: (lineId: string) => void;
};

function CartItemRowInner({ line, selected, flash, onQty, onRemove, onSelect }: Props) {
  const lineTotal = line.unitPrice * line.quantity - line.discountAmount + line.taxAmount;

  return (
    <tr
      className={`border-b border-gray-200 transition-colors dark:border-gray-700 ${
        selected ? 'bg-primary-50 dark:bg-primary-950/30' : 'bg-white dark:bg-gray-900'
      } ${flash ? 'animate-pulse bg-emerald-50/80 dark:bg-emerald-950/20' : ''}`}
      onClick={() => onSelect(line.id)}
    >
      <td className="p-3 text-sm text-gray-900 dark:text-gray-100">{line.name}</td>
      <td className="p-3">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          className="w-16 rounded border border-gray-300 bg-white px-2 py-2 text-center text-sm dark:border-gray-600 dark:bg-gray-800"
          value={line.quantity}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!Number.isNaN(v)) onQty(line.id, v);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="p-3 text-right text-sm font-medium tabular-nums text-gray-800 dark:text-gray-200">
        {line.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </td>
      <td className="p-3 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {CURRENCY}
        {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </td>
      <td className="p-3 text-right">
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(line.id);
          }}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

const CartItemRow = memo(CartItemRowInner);
export default CartItemRow;
