import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, Filter, MoreVertical, Search, TrendingUp, Users } from 'lucide-react';
import { CURRENCY } from '../../../constants';

type AgingRow = {
  bill_id: string;
  supplier_id?: string;
  supplier_name?: string;
  bill_number?: string;
  bill_date?: string;
  due_date?: string | null;
  balance_due?: number | string;
};

type Summary = {
  current?: number;
  days30?: number;
  days60?: number;
  days90Plus?: number;
};

type Pipeline = {
  draftCount?: number;
  partialOpenCount?: number;
  openPostedCount?: number;
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

function daysPastDue(r: AgingRow, now: Date): number {
  const raw = r.due_date || r.bill_date;
  if (!raw) return 0;
  const due = new Date(raw as string);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
}

function bucketForDays(days: number): { key: string; label: string; pillClass: string; rowTint?: string } {
  if (days <= 0) {
    return {
      key: 'current',
      label: 'CURRENT',
      pillClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    };
  }
  if (days <= 30) {
    return {
      key: 'd30',
      label: '1–30 DAYS',
      pillClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    };
  }
  if (days <= 60) {
    return {
      key: 'd60',
      label: '31–60 DAYS',
      pillClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300',
      rowTint: 'bg-orange-50/40 dark:bg-orange-950/10',
    };
  }
  return {
    key: 'd90',
    label: '61+ DAYS',
    pillClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
    rowTint: 'bg-rose-50/50 dark:bg-rose-950/15',
  };
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${CURRENCY} ${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${CURRENCY} ${(n / 1_000).toFixed(1)}k`;
  return `${CURRENCY} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDueDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(typeof raw === 'string' ? raw : raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export type APAgingReportProps = {
  data: {
    summary: Summary;
    totalOutstanding?: number;
    rows?: AgingRow[];
    pipeline?: Pipeline;
  };
};

export default function APAgingReport({ data }: APAgingReportProps) {
  const now = useMemo(() => new Date(), []);
  const [search, setSearch] = useState('');
  const [menuBillId, setMenuBillId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuBillId(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const summary = data.summary || {};
  const cur = Number(summary.current || 0);
  const d30 = Number(summary.days30 || 0);
  const d60 = Number(summary.days60 || 0);
  const d90 = Number(summary.days90Plus || 0);
  const total = Number(data.totalOutstanding ?? cur + d30 + d60 + d90);
  const overdue = d30 + d60 + d90;
  const overduePct = total > 0 ? (overdue / total) * 100 : 0;

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const enriched = useMemo(() => {
    return rows.map((r) => {
      const days = daysPastDue(r, now);
      const b = bucketForDays(days);
      const bal = Number(r.balance_due) || 0;
      return { ...r, daysOverdue: days, bucket: b, balance: bal };
    });
  }, [rows, now]);

  const { avgDelayDays, suppliersOverdue } = useMemo(() => {
    let wSum = 0;
    let w = 0;
    const sup = new Set<string>();
    for (const r of enriched) {
      if (r.daysOverdue > 0 && r.balance > 0) {
        wSum += r.daysOverdue * r.balance;
        w += r.balance;
        if (r.supplier_id) sup.add(String(r.supplier_id));
      }
    }
    return {
      avgDelayDays: w > 0 ? wSum / w : 0,
      suppliersOverdue: sup.size,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(
      (r) =>
        String(r.supplier_name || '')
          .toLowerCase()
          .includes(q) ||
        String(r.bill_number || '')
          .toLowerCase()
          .includes(q)
    );
  }, [enriched, search]);

  const pipeline = data.pipeline || {};
  const draftCount = Number(pipeline.draftCount ?? 0);
  const partialCount = Number(pipeline.partialOpenCount ?? 0);
  const openPosted = Number(pipeline.openPostedCount ?? enriched.length);

  const barParts = [
    { label: 'Current', amount: cur, className: 'bg-emerald-500' },
    { label: '1–30 Days', amount: d30, className: 'bg-amber-400' },
    { label: '31–60 Days', amount: d60, className: 'bg-orange-500' },
    { label: '61+ Days', amount: d90, className: 'bg-rose-600' },
  ];

  const openMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setMenuBillId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Total payables
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {CURRENCY} {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
            Outstanding AP balance
          </p>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-5 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-800/90 dark:text-rose-300">
            Overdue amount
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-400">
            {CURRENCY} {overdue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="mt-2 flex items-center gap-1 text-xs text-rose-800/80 dark:text-rose-300/90">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {overduePct.toFixed(1)}% of total
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Avg. payment delay
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {avgDelayDays > 0 ? `${avgDelayDays.toFixed(1)} days` : '—'}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Weighted by overdue balance
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Suppliers overdue
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {suppliersOverdue} {suppliersOverdue === 1 ? 'account' : 'accounts'}
          </p>
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            With open overdue balance
          </p>
        </div>
      </div>

      {/* Aging distribution */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Aging distribution</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Total liability segmented by maturity duration
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              On time
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-600" />
              Critical overdue
            </span>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex h-14 w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
            {total <= 0 ? (
              <div className="flex w-full items-center justify-center text-sm text-slate-500">No open payables</div>
            ) : (
              barParts.map((p) => {
                const pct = total > 0 ? (p.amount / total) * 100 : 0;
                if (pct <= 0) return null;
                return (
                  <div
                    key={p.label}
                    className={`relative flex min-w-0 items-center justify-center ${p.className} px-1 text-center text-xs font-semibold text-white shadow-inner sm:text-sm`}
                    style={{ width: `${pct}%` }}
                    title={`${p.label}: ${formatCompact(p.amount)}`}
                  >
                    <span className="truncate drop-shadow-sm">{formatCompact(p.amount)}</span>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            {barParts.map((p) => (
              <span key={p.label}>
                <span className="opacity-70">{p.label}:</span>{' '}
                <span className="text-slate-900 dark:text-slate-200">{formatCompact(p.amount)}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200/80 bg-sky-50/50 px-4 py-3 text-xs font-semibold dark:border-sky-900/50 dark:bg-sky-950/20">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Drafts: {draftCount}
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Partial: {partialCount}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-800 dark:text-sky-300">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Open posted: {openPosted}
            </span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
            Real-time sync active
          </span>
        </div>
      </div>

      {/* Ledger table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 p-6 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Invoice aging ledger</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Open purchase bills with balance due</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search supplier or bill…"
                className="w-full min-w-[200px] rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 sm:w-64"
              />
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800"
              aria-label="Filter"
            >
              <Filter className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Invoice ID</th>
                <th className="px-6 py-4">Due date</th>
                <th className="px-6 py-4">Days overdue</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4">Aging bucket</th>
                <th className="px-6 py-4 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center text-slate-500">
                    No bills match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const inv = `#${r.bill_number || r.bill_id?.slice(0, 8) || '—'}`;
                  const dueRaw = r.due_date || r.bill_date;
                  const showDays = Math.max(0, r.daysOverdue);
                  const pillClass =
                    showDays <= 0
                      ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      : r.bucket.pillClass;
                  return (
                    <tr
                      key={r.bill_id}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${r.bucket.rowTint ?? ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                            {initials(r.supplier_name || '')}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {r.supplier_name || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-800 dark:text-slate-200">{inv}</td>
                      <td className="px-6 py-4 tabular-nums text-slate-700 dark:text-slate-300">
                        {formatDueDate(dueRaw)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex min-w-[3rem] justify-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${pillClass}`}
                        >
                          {showDays <= 0 ? 'Current' : `${showDays} days`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {CURRENCY}{' '}
                        {r.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-xs font-bold tracking-wide ${r.daysOverdue > 60 ? 'text-rose-700 dark:text-rose-400' : r.daysOverdue > 30 ? 'text-orange-700 dark:text-orange-400' : r.daysOverdue > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}
                        >
                          {r.bucket.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="relative inline-block text-left" ref={menuBillId === r.bill_id ? menuRef : undefined}>
                          <button
                            type="button"
                            onClick={(e) => openMenu(e, r.bill_id)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                            aria-label="Row actions"
                          >
                            <MoreVertical className="h-4 w-4" strokeWidth={2} />
                          </button>
                          {menuBillId === r.bill_id ? (
                            <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 text-xs shadow-lg dark:border-slate-600 dark:bg-slate-900">
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(inv);
                                  setMenuBillId(null);
                                }}
                              >
                                Copy invoice ID
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
