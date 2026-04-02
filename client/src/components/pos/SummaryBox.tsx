import React from 'react';

type Props = {
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  discountPercent: number;
  onDiscountChange: (pct: number) => void;
  discountInputRef?: React.Ref<HTMLInputElement>;
};

export default function SummaryBox({
  subtotal,
  taxTotal,
  grandTotal,
  discountPercent,
  onDiscountChange,
  discountInputRef,
}: Props) {
  return (
    <div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/80">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>Subtotal</span>
          <span className="font-mono">{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-gray-600 dark:text-gray-400">
          <label htmlFor="pos-discount" className="shrink-0">
            Discount %
          </label>
          <input
            id="pos-discount"
            ref={discountInputRef}
            type="number"
            min={0}
            max={100}
            step={0.5}
            className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-right font-mono text-sm dark:border-gray-600 dark:bg-gray-900"
            value={discountPercent}
            onChange={(e) => onDiscountChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
        </div>
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>Tax</span>
          <span className="font-mono">{taxTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900 dark:border-gray-600 dark:text-white">
          <span>Total</span>
          <span className="font-mono">{grandTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
