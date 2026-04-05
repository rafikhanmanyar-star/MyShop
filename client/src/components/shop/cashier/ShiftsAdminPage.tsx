import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, RefreshCw, AlertCircle, UserCheck, RotateCcw } from 'lucide-react';
import { shiftsApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';

export default function ShiftsAdminPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        shiftsApi.list({ status: filter === 'all' ? undefined : filter, limit: 100 }),
        shiftsApi.getAdminSummary(),
      ]);
      setShifts(Array.isArray(listRes) ? listRes : []);
      setSummary(summaryRes);
    } catch (e) {
      console.error(e);
      setShifts([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReopen = async (shiftId: string) => {
    if (!confirm('Reopen this shift? This will allow the cashier to add sales again. Audit trail will be recorded.')) return;
    setReopeningId(shiftId);
    try {
      await shiftsApi.reopen(shiftId);
      await load();
    } catch (e: any) {
      alert(e?.message || e?.error || 'Failed to reopen');
    } finally {
      setReopeningId(null);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col h-full min-h-0 flex-1 bg-muted/80 dark:bg-slate-800">
      <div className="bg-card dark:bg-slate-900 border-b border-border dark:border-slate-700 px-6 md:px-8 py-6 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground dark:text-slate-200 tracking-tight">Shifts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Cashier shifts, variance, and reopen closed shifts.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter shifts by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm bg-background dark:bg-slate-800/90 text-foreground focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 outline-none"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
            <button
              type="button"
              onClick={() => load()}
              className="p-2 rounded-xl border border-border dark:border-slate-600 text-muted-foreground hover:bg-muted/50 dark:hover:bg-slate-800"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-6 md:p-8 space-y-8">
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-5 shadow-sm dark:shadow-none">
              <p className="text-sm font-medium text-muted-foreground">Open shifts</p>
              <p className="text-2xl font-bold text-foreground dark:text-slate-100">{summary.openShifts ?? 0}</p>
            </div>
            <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-5 shadow-sm dark:shadow-none">
              <p className="text-sm font-medium text-muted-foreground">Closed shifts</p>
              <p className="text-2xl font-bold text-foreground dark:text-slate-100">{summary.closedShifts ?? 0}</p>
            </div>
            <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-5 shadow-sm dark:shadow-none">
              <p className="text-sm font-medium text-muted-foreground">Total shortage</p>
              <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{CURRENCY} {Number(summary.totalVarianceShortage || 0).toFixed(2)}</p>
            </div>
            <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-5 shadow-sm dark:shadow-none">
              <p className="text-sm font-medium text-muted-foreground">Total overage</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{CURRENCY} {Number(summary.totalVarianceOverage || 0).toFixed(2)}</p>
            </div>
          </div>
        )}

        {summary?.byCashier?.length > 0 && (
          <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-6 shadow-sm dark:shadow-none">
            <h3 className="font-semibold text-foreground dark:text-slate-200 mb-4">Cashier performance (closed shifts)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-slate-600 text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Cashier</th>
                    <th className="pb-2 pr-4">Total sales</th>
                    <th className="pb-2 pr-4">Transactions</th>
                    <th className="pb-2 pr-4">Variance sum</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byCashier.map((c: any) => (
                    <tr key={c.cashierId} className="border-b border-border dark:border-slate-700/80">
                      <td className="py-2 pr-4 font-medium text-foreground">{c.cashierName}</td>
                      <td className="py-2 pr-4">{CURRENCY} {Number(c.totalSales || 0).toFixed(2)}</td>
                      <td className="py-2 pr-4">{c.transactionCount ?? 0}</td>
                      <td className={`py-2 pr-4 ${Number(c.varianceSum) < 0 ? 'text-rose-600 dark:text-rose-400' : Number(c.varianceSum) > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                        {CURRENCY} {Number(c.varianceSum || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 shadow-sm dark:shadow-none overflow-hidden">
          <h3 className="font-semibold text-foreground dark:text-slate-200 p-4 border-b border-border dark:border-slate-600">Shift list</h3>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : shifts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No shifts found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/80 dark:bg-slate-800/90 border-b border-border dark:border-slate-600 text-left text-muted-foreground">
                    <th className="p-3">Cashier</th>
                    <th className="p-3">Terminal</th>
                    <th className="p-3">Branch</th>
                    <th className="p-3">Opened</th>
                    <th className="p-3">Closed</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Variance</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s) => (
                    <tr key={s.id} className="border-b border-border dark:border-slate-700/80 hover:bg-muted/50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-medium text-foreground">{s.cashier_name ?? s.cashier_id}</td>
                      <td className="p-3">{s.terminal_name ?? s.terminal_code ?? s.terminal_id}</td>
                      <td className="p-3">{s.branch_name ?? '—'}</td>
                      <td className="p-3 text-muted-foreground">{s.opening_time ? new Date(s.opening_time).toLocaleString() : '—'}</td>
                      <td className="p-3 text-muted-foreground">{s.closing_time ? new Date(s.closing_time).toLocaleString() : '—'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'open' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-muted text-muted-foreground dark:bg-slate-800'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {s.variance_amount != null ? (
                          <span className={Number(s.variance_amount) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                            {CURRENCY} {Number(s.variance_amount).toFixed(2)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-3">
                        {s.status === 'closed' && (
                          <button
                            type="button"
                            onClick={() => handleReopen(s.id)}
                            disabled={reopeningId === s.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200 text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reopen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
