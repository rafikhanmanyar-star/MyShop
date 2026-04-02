import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { shopApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Button from '../../ui/Button';
import { RefreshCw, Plus, Eye } from 'lucide-react';

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );
}

export default function SalesReturnListPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await shopApi.getSalesReturns();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const h = () => load();
    window.addEventListener('shop:realtime', h as EventListener);
    return () => window.removeEventListener('shop:realtime', h as EventListener);
  }, [load]);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Sales returns</h1>
          <p className="text-sm text-muted-foreground mt-1">Refunds and stock restocking linked to POS invoices.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => load()} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link to="/sales-returns/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New return
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border dark:border-slate-700 overflow-hidden bg-card dark:bg-slate-900/60 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border dark:border-slate-700 bg-muted/50 dark:bg-slate-800/80 text-left">
                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">Return no.</th>
                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right">Amount</th>
                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">Refund</th>
                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No returns yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 dark:border-slate-800/80 hover:bg-muted/30 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-semibold">{r.returnNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.returnDate ? new Date(r.returnDate).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">{r.customerName || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {CURRENCY} {formatMoney(parseFloat(r.totalReturnAmount) || 0)}
                    </td>
                    <td className="px-4 py-3">{r.returnType}</td>
                    <td className="px-4 py-3">{r.refundMethod}</td>
                    <td className="px-4 py-3">
                      <Link to={`/sales-returns/${r.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1">
                          <Eye className="w-4 h-4" />
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
