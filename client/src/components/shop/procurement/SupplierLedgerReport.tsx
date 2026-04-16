import React, { useMemo, useState, useCallback } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  FileUp,
  Filter,
  MoreVertical,
} from 'lucide-react';
import { CURRENCY } from '../../../constants';

const CHART_BLUE = '#2563eb';
const CHART_TEAL = '#0d9488';

type LedgerPurchase = {
  id: string;
  supplier_id?: string;
  supplier_name?: string;
  bill_number?: string;
  bill_date?: string;
  due_date?: string | null;
  total_amount?: number | string;
  paid_amount?: number | string;
  balance_due?: number | string;
  status?: string;
};

type LedgerPayment = {
  id: string;
  supplier_id?: string;
  supplier_name?: string;
  amount?: number | string;
  payment_date?: string;
  reference?: string | null;
};

export type SupplierLedgerData = {
  purchases: LedgerPurchase[];
  payments: LedgerPayment[];
  outstandingBySupplier: Record<string, number>;
};

function initials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return `${CURRENCY} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDisplayDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type RowStatus = 'RECONCILED' | 'PENDING' | 'OVERDUE';

function statusForPurchase(p: LedgerPurchase, now: Date): RowStatus {
  const bal = num(p.balance_due);
  if (bal <= 0) return 'RECONCILED';
  const dueRaw = p.due_date || p.bill_date;
  if (dueRaw) {
    const due = new Date(dueRaw);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    if (!Number.isNaN(due.getTime()) && due.getTime() < dayStart.getTime()) {
      return 'OVERDUE';
    }
  }
  return 'PENDING';
}

const STATUS_STYLES: Record<RowStatus, string> = {
  RECONCILED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  PENDING: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  OVERDUE: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
};

type LedgerRow = {
  id: string;
  kind: 'purchase' | 'payment';
  supplierName: string;
  date: string;
  debit: number;
  credit: number;
  balanceAfter: number;
  status: RowStatus;
};

const PAGE_SIZE = 6;

const tooltipStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  fontSize: '12px',
};

export type SupplierLedgerReportProps = {
  data: SupplierLedgerData;
};

export default function SupplierLedgerReport({ data }: SupplierLedgerReportProps) {
  const now = useMemo(() => new Date(), []);
  const [statusFilter, setStatusFilter] = useState<'all' | RowStatus>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [page, setPage] = useState(1);
  const [moreOpen, setMoreOpen] = useState(false);

  const purchases = Array.isArray(data.purchases) ? data.purchases : [];
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const outstandingBySupplier = data.outstandingBySupplier || {};

  const totalOutstanding = useMemo(
    () => Object.values(outstandingBySupplier).reduce((s, v) => s + num(v), 0),
    [outstandingBySupplier]
  );

  const pendingInvoiceCount = useMemo(
    () => purchases.filter((p) => num(p.balance_due) > 0).length,
    [purchases]
  );

  const avgDaysOpen = useMemo(() => {
    let w = 0;
    let tw = 0;
    const n = new Date();
    for (const p of purchases) {
      const bal = num(p.balance_due);
      if (bal <= 0) continue;
      const bd = p.bill_date ? new Date(p.bill_date) : null;
      if (!bd || Number.isNaN(bd.getTime())) continue;
      const days = Math.max(0, Math.floor((n.getTime() - bd.getTime()) / (24 * 60 * 60 * 1000)));
      w += days * bal;
      tw += bal;
    }
    if (tw <= 0) return 0;
    return Math.round(w / tw);
  }, [purchases]);

  const overdueTotal = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    let s = 0;
    for (const p of purchases) {
      if (num(p.balance_due) <= 0) continue;
      const dueRaw = p.due_date || p.bill_date;
      if (!dueRaw) continue;
      const due = new Date(dueRaw);
      if (!Number.isNaN(due.getTime()) && due.getTime() < dayStart.getTime()) {
        s += num(p.balance_due);
      }
    }
    return s;
  }, [purchases]);

  const outstandingTrendPct = useMemo(() => {
    if (totalOutstanding <= 0) return null;
    return (100 * overdueTotal) / totalOutstanding;
  }, [totalOutstanding, overdueTotal]);

  const payCycleTrendDays = useMemo(() => {
    const payDates = payments
      .map((p) => (p.payment_date ? new Date(p.payment_date).getTime() : NaN))
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);
    if (payDates.length < 4) return null;
    const mid = Math.floor(payDates.length / 2);
    const gap = (t: number[]) => {
      let g = 0;
      for (let i = 1; i < t.length; i++) g += (t[i] - t[i - 1]) / (24 * 60 * 60 * 1000);
      return g / Math.max(1, t.length - 1);
    };
    const a = gap(payDates.slice(0, mid));
    const b = gap(payDates.slice(mid));
    if (a <= 0 || b <= 0) return null;
    return Math.round(Math.abs(a - b));
  }, [payments]);

  const monthlyTrend = useMemo(() => {
    const months: { key: string; label: string; purchases: number; payments: number }[] = [];
    const anchor = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      months.push({ key, label, purchases: 0, payments: 0 });
    }
    const idx = new Map(months.map((m, i) => [m.key, i] as const));
    for (const p of purchases) {
      if (!p.bill_date) continue;
      const d = new Date(p.bill_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const i = idx.get(key);
      if (i !== undefined) months[i].purchases += num(p.total_amount);
    }
    for (const p of payments) {
      if (!p.payment_date) continue;
      const d = new Date(p.payment_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const i = idx.get(key);
      if (i !== undefined) months[i].payments += num(p.amount);
    }
    return months;
  }, [purchases, payments]);

  const topSuppliers = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of purchases) {
      const name = p.supplier_name || 'Unknown';
      map.set(name, (map.get(name) || 0) + num(p.total_amount));
    }
    const list = [...map.entries()]
      .map(([name, volume]) => ({ name, volume }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);
    const max = list.reduce((m, x) => Math.max(m, x.volume), 0) || 1;
    return list.map((x) => ({ ...x, pct: Math.round((100 * x.volume) / max) }));
  }, [purchases]);

  const rebateQuarter = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    let payVol = 0;
    for (const p of payments) {
      if (!p.payment_date) continue;
      const d = new Date(p.payment_date);
      if (d >= cutoff) payVol += num(p.amount);
    }
    const saved = Math.round(payVol * 0.012);
    const goal = 20000;
    const progress = Math.min(100, goal > 0 ? Math.round((saved / goal) * 100) : 0);
    return { saved, progress };
  }, [payments]);

  const ledgerRows = useMemo(() => {
    type Raw = {
      id: string;
      kind: 'purchase' | 'payment';
      supplierName: string;
      date: string;
      debit: number;
      credit: number;
      status: RowStatus;
      sort: number;
    };
    const raw: Raw[] = [];
    for (const p of purchases) {
      const bd = p.bill_date || '';
      const t = bd ? new Date(bd).getTime() : 0;
      raw.push({
        id: `p-${p.id}`,
        kind: 'purchase',
        supplierName: String(p.supplier_name || 'Supplier'),
        date: bd,
        debit: num(p.total_amount),
        credit: 0,
        status: statusForPurchase(p, now),
        sort: t,
      });
    }
    for (const p of payments) {
      const pd = p.payment_date || '';
      const t = pd ? new Date(pd).getTime() : 0;
      raw.push({
        id: `pay-${p.id}`,
        kind: 'payment',
        supplierName: String(p.supplier_name || 'Supplier'),
        date: pd,
        debit: 0,
        credit: num(p.amount),
        status: 'RECONCILED',
        sort: t,
      });
    }
    raw.sort((a, b) => a.sort - b.sort);
    let running = 0;
    const withBalance: LedgerRow[] = raw.map((r) => {
      running += r.debit - r.credit;
      return {
        id: r.id,
        kind: r.kind,
        supplierName: r.supplierName,
        date: r.date,
        debit: r.debit,
        credit: r.credit,
        balanceAfter: running,
        status: r.status,
      };
    });
    return withBalance.reverse();
  }, [purchases, payments, now]);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return ledgerRows;
    return ledgerRows.filter((r) => r.status === statusFilter);
  }, [ledgerRows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const pageButtonList = useMemo(() => {
    const tp = totalPages;
    const p = safePage;
    if (tp <= 5) return Array.from({ length: tp }, (_, i) => i + 1);
    const out: (number | 'gap')[] = [];
    const push = (n: number | 'gap') => {
      if (out.length && out[out.length - 1] === n) return;
      out.push(n);
    };
    push(1);
    if (p > 3) push('gap');
    for (let i = Math.max(2, p - 1); i <= Math.min(tp - 1, p + 1); i++) push(i);
    if (p < tp - 2) push('gap');
    if (tp > 1) push(tp);
    return out;
  }, [totalPages, safePage]);

  const exportCsv = useCallback(() => {
    const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [
      ['Supplier', 'Date', 'Debit', 'Credit', 'Balance', 'Status'].join(','),
    ];
    for (const r of filteredRows) {
      lines.push(
        [
          escape(r.supplierName),
          escape(r.date?.slice(0, 10) || ''),
          String(r.debit),
          String(r.credit),
          String(r.balanceAfter),
          escape(r.status),
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `supplier-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filteredRows]);

  const onImportCsv = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      input.files?.[0]?.name;
    };
    input.click();
  }, []);

  return (
    <div className="space-y-6 rounded-2xl bg-slate-50 p-4 md:p-6 dark:bg-transparent">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Supplier Ledger</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Review accounts payable and transaction distributions across your supplier network.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Total Outstanding
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {formatMoney(totalOutstanding)}
            </span>
            {outstandingTrendPct != null && outstandingTrendPct > 0 ? (
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                ~{outstandingTrendPct.toFixed(1)}% overdue
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Pending Approvals
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {pendingInvoiceCount}{' '}
            <span className="text-base font-semibold text-slate-600 dark:text-slate-300">Invoices</span>
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Open balances on posted bills</p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Avg. Pay Cycle
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {avgDaysOpen > 0 ? `${avgDaysOpen} Days` : '—'}
            </span>
            {payCycleTrendDays != null ? (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                ~{payCycleTrendDays}d spacing
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Weighted age of open payables
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_min(100%,340px)] xl:items-start">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Purchases vs Payments Trend
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Consolidated monthly volume across all registered suppliers.
                </p>
              </div>
            </div>
            {monthlyTrend.every((m) => m.purchases === 0 && m.payments === 0) ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-slate-500">
                No monthly purchase or payment data in this range yet.
              </div>
            ) : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ledgerPurchFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_BLUE} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={CHART_BLUE} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ledgerPayFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_TEAL} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={CHART_TEAL} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatMoney(v), name === 'purchases' ? 'Purchases' : 'Payments']}
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: 'var(--muted-foreground)' }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
                      formatter={(value) => (value === 'purchases' ? 'Purchases' : 'Payments')}
                    />
                    <Area
                      type="monotone"
                      dataKey="purchases"
                      name="purchases"
                      stroke={CHART_BLUE}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#ledgerPurchFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="payments"
                      name="payments"
                      stroke={CHART_TEAL}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#ledgerPayFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div
            id="ledger-entries-table"
            className="rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Recent Ledger Entries</h3>
              <div className="relative flex items-center gap-1">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowFilterMenu((v) => !v)}
                    className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-expanded={showFilterMenu ? 'true' : 'false'}
                    aria-haspopup="true"
                    aria-label="Filter by status"
                  >
                    <Filter className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                  {showFilterMenu ? (
                    <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900">
                      {(['all', 'RECONCILED', 'PENDING', 'OVERDUE'] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                          onClick={() => {
                            setStatusFilter(k === 'all' ? 'all' : k);
                            setShowFilterMenu(false);
                            setPage(1);
                          }}
                        >
                          {k === 'all' ? 'All statuses' : k}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMoreOpen((v) => !v)}
                    className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="More actions"
                  >
                    <MoreVertical className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                  {moreOpen ? (
                    <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900">
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => {
                          exportCsv();
                          setMoreOpen(false);
                        }}
                      >
                        Export CSV
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-5 py-3">Supplier name</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3 text-right">Debit</th>
                    <th className="px-5 py-3 text-right">Credit</th>
                    <th className="px-5 py-3 text-right">Balance</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                        No ledger entries match this filter.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-50 last:border-0 dark:border-slate-800/80"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                              {initials(r.supplierName)}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">{r.supplierName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{formatDisplayDate(r.date)}</td>
                        <td className="px-5 py-4 text-right tabular-nums text-slate-800 dark:text-slate-200">
                          {r.debit > 0 ? formatMoney(r.debit) : '—'}
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums text-slate-800 dark:text-slate-200">
                          {r.credit > 0 ? formatMoney(r.credit) : '—'}
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {formatMoney(r.balanceAfter)}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[r.status]}`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing{' '}
                {filteredRows.length === 0
                  ? '0'
                  : `${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, filteredRows.length)}`}{' '}
                of {filteredRows.length.toLocaleString()} records
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageButtonList.map((item, i) =>
                  item === 'gap' ? (
                    <span key={`gap-${i}`} className="px-1 text-slate-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      className={`min-w-[2rem] rounded-lg px-2 py-1 text-sm font-semibold ${
                        safePage === item
                          ? 'bg-[#1e3a5f] text-white dark:bg-indigo-600'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Top Suppliers by Volume</h3>
            <div className="mt-4 space-y-4">
              {topSuppliers.length === 0 ? (
                <p className="text-sm text-slate-500">No purchase volume yet.</p>
              ) : (
                topSuppliers.map((s) => (
                  <div key={s.name}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200" title={s.name}>
                        {s.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-400">
                        {formatMoney(s.volume)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-[#2563eb] transition-all"
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              className="mt-5 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-[#1e3a5f] hover:bg-slate-50 dark:border-slate-600 dark:text-indigo-400 dark:hover:bg-slate-800"
            >
              View All Suppliers
            </button>
          </div>

          <div className="rounded-2xl bg-[#2563eb] p-5 text-white shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Early Payment Rebates</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{formatMoney(rebateQuarter.saved)}</p>
            <p className="mt-1 text-sm text-white/90">Saved this fiscal quarter (est. from recent payments).</p>
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs font-medium text-white/90">
                <span>Quarterly goal</span>
                <span>{rebateQuarter.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-all"
                  style={{ width: `${rebateQuarter.progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Quick Actions</h3>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={onImportCsv}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileUp className="h-5 w-5 text-[#2563eb]" strokeWidth={1.75} />
                Import CSV
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => {
                  const el = document.getElementById('ledger-entries-table');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <Clock className="h-5 w-5 text-[#2563eb]" strokeWidth={1.75} />
                Reconciliation Logs
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
