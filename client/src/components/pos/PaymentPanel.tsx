import React, { useEffect, useState } from 'react';
import { khataApi } from '../../services/shopApi';
import type { PosCustomer, PaymentMethodUi } from './posReducer';

type Props = {
  customer: PosCustomer | null;
  onCustomer: (c: PosCustomer | null) => void;
  paymentMethod: PaymentMethodUi;
  onPaymentMethod: (m: PaymentMethodUi) => void;
  receivedAmount: string;
  onReceivedChange: (v: string) => void;
  grandTotal: number;
  changeDue: number;
  onComplete: () => void;
  onHold: () => void;
  onClear: () => void;
  completing: boolean;
  error: string | null;
  onRetry: () => void;
  canComplete: boolean;
};

export default function PaymentPanel({
  customer,
  onCustomer,
  paymentMethod,
  onPaymentMethod,
  receivedAmount,
  onReceivedChange,
  grandTotal,
  changeDue,
  onComplete,
  onHold,
  onClear,
  completing,
  error,
  onRetry,
  canComplete,
}: Props) {
  const [customers, setCustomers] = useState<{ id: string; name: string; contact_no: string | null }[]>([]);

  useEffect(() => {
    khataApi
      .getCustomers()
      .then((list) => setCustomers(Array.isArray(list) ? list : []))
      .catch(() => setCustomers([]));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white p-4 dark:bg-gray-900">
      <div className="mb-4">
        <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Customer</label>
        <select
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-800"
          value={customer?.id ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) {
              onCustomer(null);
              return;
            }
            const row = customers.find((c) => c.id === id);
            if (row) onCustomer({ id: row.id, name: row.name, phone: row.contact_no ?? undefined });
          }}
        >
          <option value="">Walk-in</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <span className="mb-2 block text-xs font-semibold uppercase text-gray-500">Payment</span>
        <div className="flex flex-col gap-2">
          {(['cash', 'bank', 'wallet'] as const).map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 touch-manipulation ${
                paymentMethod === m ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40' : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <input type="radio" name="pay" checked={paymentMethod === m} onChange={() => onPaymentMethod(m)} className="h-4 w-4" />
              <span className="text-sm font-medium capitalize text-gray-800 dark:text-gray-200">{m}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Amount received</label>
        <input
          id="pos-payment-received"
          type="number"
          className="w-full rounded-lg border border-gray-200 px-3 py-3 text-lg font-semibold dark:border-gray-700 dark:bg-gray-800"
          value={receivedAmount}
          onChange={(e) => onReceivedChange(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        {changeDue > 0 && (
          <p className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">Change: {changeDue.toFixed(2)}</p>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
          <button type="button" className="mt-2 font-semibold underline" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      <div className="mt-auto space-y-3">
        <button
          type="button"
          disabled={!canComplete || completing}
          onClick={onComplete}
          className="w-full rounded-lg bg-green-500 py-3 text-base font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
        >
          {completing ? 'Processing…' : 'Complete sale (Enter)'}
        </button>
        <button
          type="button"
          onClick={onHold}
          className="w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 touch-manipulation"
        >
          Hold sale
        </button>
        <button
          type="button"
          onClick={onClear}
          className="w-full rounded-lg bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-600 touch-manipulation"
        >
          Clear cart
        </button>
      </div>
    </div>
  );
}
