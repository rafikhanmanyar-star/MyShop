import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { shopApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Button from '../../ui/Button';
import { ArrowLeft, Package, BookOpen } from 'lucide-react';

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );
}

export default function SalesReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const row = await shopApi.getSalesReturn(id);
      setData(row);
    } catch (e: any) {
      setError(e?.error || e?.message || 'Not found');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto py-8 space-y-4">
        <p className="text-rose-600 dark:text-rose-400">{error || 'Not found'}</p>
        <Link to="/sales-returns">
          <Button variant="secondary">Back to list</Button>
        </Link>
      </div>
    );
  }

  const items = Array.isArray(data.items) ? data.items : [];

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/sales-returns" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">{data.returnNumber}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Original invoice{' '}
            <span className="font-semibold text-foreground">{data.originalSaleNumber || data.originalSaleId}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border dark:border-slate-700 p-5 bg-card dark:bg-slate-900/60">
          <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Return amount</div>
          <div className="text-2xl font-semibold font-mono mt-1">
            {CURRENCY} {formatMoney(parseFloat(data.totalReturnAmount) || 0)}
          </div>
        </div>
        <div className="rounded-2xl border border-border dark:border-slate-700 p-5 bg-card dark:bg-slate-900/60">
          <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Refund</div>
          <div className="text-lg font-bold mt-1">
            {data.refundMethod}
            {data.bankAccountId ? <span className="text-muted-foreground text-sm font-normal"> (bank linked)</span> : null}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{data.customerName || 'Walk-in'}</div>
        </div>
      </div>

      <section className="rounded-2xl border border-border dark:border-slate-700 overflow-hidden bg-card dark:bg-slate-900/60">
        <div className="px-5 py-3 border-b border-border dark:border-slate-700 flex items-center gap-2 font-bold">
          <Package className="w-4 h-4" />
          Returned lines
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground bg-muted/40">
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Qty</th>
              <th className="px-4 py-2 text-right">Line total</th>
              <th className="px-4 py-2">Restock</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row: any) => (
              <tr key={row.id} className="border-b border-border/60">
                <td className="px-4 py-2">{row.productName}</td>
                <td className="px-4 py-2 font-mono">{row.quantity}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {CURRENCY} {formatMoney(parseFloat(row.totalPrice) || 0)}
                </td>
                <td className="px-4 py-2">{row.restock ? 'Yes' : 'No (damaged / not restocked)'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-indigo-500/25 bg-indigo-50/40 dark:bg-indigo-950/20 p-5 space-y-2">
        <div className="flex items-center gap-2 font-bold">
          <BookOpen className="w-4 h-4" />
          Accounting impact (summary)
        </div>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>
            Debit <strong className="text-foreground">Sales Returns</strong> for the refund amount; credit{' '}
            {data.refundMethod === 'WALLET' && 'Customer advances (store credit)'}
            {data.refundMethod === 'ADJUSTMENT' && 'Accounts receivable (and customer balance where applicable)'}
            {(data.refundMethod === 'CASH' || data.refundMethod === 'BANK') && 'Cash or bank (chart-linked)'}
            .
          </li>
          <li>
            For restocked lines: <strong className="text-foreground">Debit Inventory</strong>,{' '}
            <strong className="text-foreground">Credit COGS</strong> at the original unit cost snapshot.
          </li>
          <li>Khata / credit sales may also post a matching credit on the khata ledger.</li>
        </ul>
      </section>

      {data.notes && (
        <div className="rounded-xl border border-border px-4 py-3 text-sm bg-muted/30">
          <span className="font-semibold">Notes: </span>
          {data.notes}
        </div>
      )}
    </div>
  );
}
