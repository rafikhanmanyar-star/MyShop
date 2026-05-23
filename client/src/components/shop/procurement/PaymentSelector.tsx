import React from 'react';
import Select from '../../ui/Select';
import { formatPayFromAccountLabel, type PayFromAccountOption } from '../../../utils/payFromAccounts';

export type PaymentStatus = 'Credit' | 'Paid' | 'Partial';

export interface PaymentSelectorProps {
  value: PaymentStatus;
  onChange: (v: PaymentStatus) => void;
  paidAmount: number;
  onPaidAmountChange: (n: number) => void;
  totalAmount: number;
  chartAccountId: string;
  onChartAccountChange: (id: string) => void;
  payFromAccounts: PayFromAccountOption[];
  disabled?: boolean;
}

const segments: { id: PaymentStatus; label: string }[] = [
  { id: 'Paid', label: 'Paid' },
  { id: 'Partial', label: 'Partial' },
  { id: 'Credit', label: 'Credit' },
];

export default function PaymentSelector({
  value,
  onChange,
  paidAmount,
  onPaidAmountChange,
  totalAmount,
  chartAccountId,
  onChartAccountChange,
  payFromAccounts,
  disabled,
}: PaymentSelectorProps) {
  const showPayFrom = value === 'Paid' || value === 'Partial';

  return (
    <div
      className={`grid grid-cols-1 gap-2 xl:items-end ${showPayFrom ? 'xl:grid-cols-4' : ''}`}
    >
      <div className={`min-w-0 ${showPayFrom ? 'xl:col-span-2' : ''}`}>
        <label className="label mb-0.5 block">Payment</label>
        <div className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-card p-0.5">
          {segments.map((s) => {
            const active = value === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange(s.id)}
                className={`button-text min-w-[4.5rem] flex-1 rounded-md px-2 py-1.5 text-center text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-primary'
                } disabled:opacity-50`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {value === 'Partial' && (
        <div data-procurement-barcode-ignore>
          <label className="label mb-0.5 block">Amount paid</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={paidAmount || ''}
            onChange={(e) => onPaidAmountChange(parseFloat(e.target.value) || 0)}
            aria-label="Amount paid"
            className="input input-text tabular-nums"
          />
        </div>
      )}
      {value === 'Paid' && (
        <div>
          <label className="label mb-0.5 block">Amount paid</label>
          <input
            type="text"
            readOnly
            value={`${totalAmount.toLocaleString()}`}
            aria-label="Amount paid in full"
            className="input input-text numeric-data cursor-default bg-muted"
          />
        </div>
      )}
      {showPayFrom && (
        <div>
          <label className="label mb-0.5 block">Pay from</label>
          {payFromAccounts.length > 0 ? (
            <Select
              value={chartAccountId}
              onChange={(e) => onChartAccountChange(e.target.value)}
              className="w-full"
              disabled={disabled}
            >
              <option value="">Select account…</option>
              {payFromAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {formatPayFromAccountLabel(acc)}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add a cash or bank Asset account in Settings → Chart of Accounts.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
