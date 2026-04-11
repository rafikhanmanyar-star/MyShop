import React from 'react';
import Select from '../../ui/Select';

export type PaymentStatus = 'Credit' | 'Paid' | 'Partial';

export interface PaymentSelectorProps {
  value: PaymentStatus;
  onChange: (v: PaymentStatus) => void;
  paidAmount: number;
  onPaidAmountChange: (n: number) => void;
  totalAmount: number;
  bankAccountId: string;
  onBankAccountChange: (id: string) => void;
  bankAccounts: { id: string; name: string }[];
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
  bankAccountId,
  onBankAccountChange,
  bankAccounts,
  disabled,
}: PaymentSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="label">Payment</label>
      <div className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-card p-0.5">
        {segments.map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(s.id)}
              className={`button-text min-w-[4.5rem] flex-1 rounded-md px-2 py-1.5 text-center font-semibold transition-all duration-200 active:scale-[0.98] ${
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

      {(value === 'Paid' || value === 'Partial') && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
          {value === 'Partial' && (
            <div>
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
          <div>
            <label className="label mb-0.5 block">Bank account</label>
            <Select value={bankAccountId} onChange={(e) => onBankAccountChange(e.target.value)} className="w-full">
              <option value="">Cash</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
