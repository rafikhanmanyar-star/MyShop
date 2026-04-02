import React from 'react';
import { CURRENCY } from '../../constants';

type Props = {
  subtotal: number;
  discountPercent: number;
  taxTotal: number;
  grandTotal: number;
  onDiscountChange: (pct: number) => void;
  discountInputRef?: React.Ref<HTMLInputElement>;
};

export default function SummaryBox({
  subtotal,
  discountPercent,
  taxTotal,
  grandTotal,
  onDiscountChange,
  discountInputRef,
}: Props) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:border-gray-700 dark:bg-gray-900">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>Subtotal</span>
          <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">
            {CURRENCY}
            {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-gray-600 dark:text-gray-400">
          <span>Discount %</span>
          <input
            ref={discountInputRef}
            type="number"
            min={0}
            max={100}
            className="w-20 rounded border border-gray-300 px-2 py-2 text-right text-sm dark:border-gray-600 dark:bg-gray-800"
            value={discountPercent || ''}
            onChange={(e) => onDiscountChange(Number(e.target.value) || 0)}
          />
        </div>
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>Tax</span>
          <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">
            {CURRENCY}
            {taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-baseline justify-between border-t border-gray-200 pt-3 dark:border-gray-700">
          <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">Grand total</span>
          <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50">
            {CURRENCY}
            {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}
