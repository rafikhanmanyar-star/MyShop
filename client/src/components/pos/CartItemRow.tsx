import React from 'react';
import type { CartLine } from './posReducer';

type Props = {
  line: CartLine;
  selected: boolean;
  flash: boolean;
  onQty: (lineId: string, q: number) => void;
  onRemove: (lineId: string) => void;
  onSelect: (lineId: string) => void;
};

export default function CartItemRow({
  line,
  selected,
  flash,
  onQty,
  onRemove,
  onSelect,
}: Props) {
  const total = line.qty * line.unitPrice;
  return (
    <tr
      className={`border-t border-gray-100 dark:border-gray-800 ${
        selected ? 'bg-primary-50 dark:bg-primary-950/30' : ''
      } ${flash ? 'animate-pulse bg-amber-50 dark:bg-amber-950/20' : ''}`}
      onClick={() => onSelect(line.id)}
    >
      <td className="p-3 align-top">
        <div className="font-medium text-gray-900 dark:text-gray-100">{line.name}</div>
        {line.sku ? <div className="text-xs text-gray-500">{line.sku}</div> : null}
      </td>
      <td className="p-3 align-top">
        <input
          type="number"
          min={1}
          step={1}
          className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
          value={line.qty}
          onChange={(e) => {
            const q = Math.max(1, Math.floor(Number(e.target.value) || 1));
            onQty(line.id, q);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="p-3 text-right align-top font-mono text-sm">{line.unitPrice.toFixed(2)}</td>
      <td className="p-3 text-right align-top font-mono text-sm font-semibold">{total.toFixed(2)}</td>
      <td className="p-3 align-top">
        <button
          type="button"
          className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(line.id);
          }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}
