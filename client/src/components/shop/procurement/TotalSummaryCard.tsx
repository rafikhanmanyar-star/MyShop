import React from 'react';

export interface TotalSummaryCardProps {
  currencyLabel: string;
  subtotal: number;
  tax: number;
  total: number;
  stickyMobile?: boolean;
}

export default function TotalSummaryCard({
  currencyLabel,
  subtotal,
  tax,
  total,
  stickyMobile,
}: TotalSummaryCardProps) {
  return (
    <div
      className={`rounded-lg border border-border bg-muted p-4 shadow-erp dark:shadow-erp-md ${
        stickyMobile
          ? 'max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-40 max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 max-md:shadow-[0_-4px_24px_rgba(15,23,42,0.08)] dark:max-md:shadow-[0_-4px_24px_rgba(0,0,0,0.4)] md:static md:sticky md:top-0'
          : ''
      }`}
    >
      <div className="ml-auto max-w-xs space-y-2 text-right">
        <div className="body-text flex justify-between gap-8 text-muted-foreground">
          <span>Subtotal</span>
          <span className="numeric-data text-foreground">
            {currencyLabel} {subtotal.toLocaleString()}
          </span>
        </div>
        <div className="body-text flex justify-between gap-8 text-muted-foreground">
          <span>Tax</span>
          <span className="numeric-data text-foreground">
            {currencyLabel} {tax.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-8 border-t border-border pt-2 text-lg font-bold text-foreground">
          <span>Total</span>
          <span className="numeric-data">
            {currencyLabel} {total.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
