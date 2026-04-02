import React from 'react';
import type { CartLine } from './posReducer';
import CartItemRow from './CartItemRow';
import SummaryBox from './SummaryBox';

type Props = {
  lines: CartLine[];
  flashLineId: string | null;
  selectedLineId: string | null;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  discountPercent: number;
  onQty: (lineId: string, q: number) => void;
  onRemove: (lineId: string) => void;
  onSelectLine: (lineId: string) => void;
  onDiscountChange: (pct: number) => void;
  discountInputRef?: React.Ref<HTMLInputElement>;
};

export default function CartPanel({
  lines,
  flashLineId,
  selectedLineId,
  subtotal,
  taxTotal,
  grandTotal,
  discountPercent,
  onQty,
  onRemove,
  onSelectLine,
  onDiscountChange,
  discountInputRef,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Cart</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {lines.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-500">No items yet</div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
              <tr className="text-left text-xs font-semibold uppercase text-gray-500">
                <th className="p-3">Product</th>
                <th className="p-3">Qty</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <CartItemRow
                  key={line.id}
                  line={line}
                  selected={line.id === selectedLineId}
                  flash={line.id === flashLineId}
                  onQty={onQty}
                  onRemove={onRemove}
                  onSelect={onSelectLine}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <SummaryBox
        subtotal={subtotal}
        discountPercent={discountPercent}
        taxTotal={taxTotal}
        grandTotal={grandTotal}
        onDiscountChange={onDiscountChange}
        discountInputRef={discountInputRef}
      />
    </div>
  );
}
