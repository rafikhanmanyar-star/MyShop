import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  Bell,
  Calendar,
  Check,
  Filter,
  Layers,
  Package,
  Search,
  Settings,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { CURRENCY } from '../../../constants';

type ValItem = {
  id: string;
  name?: string;
  sku?: string;
  unit?: string;
  quantity_on_hand?: number;
  unit_cost?: number;
  total_value?: number;
  reorder_point?: number | null;
  category_id?: string | null;
};

function formatCompactValue(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${CURRENCY}${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${CURRENCY}${(n / 1_000).toFixed(2)}k`;
  return `${CURRENCY}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatCompactBar(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${CURRENCY}${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${CURRENCY}${(n / 1_000).toFixed(0)}k`;
  return `${CURRENCY}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function stockStatusLabel(item: ValItem): { label: string; pillClass: string } {
  const rp = Math.max(1, Number(item.reorder_point ?? 10) || 10);
  const q = Number(item.quantity_on_hand) || 0;
  if (q <= rp) {
    return {
      label: 'LOW STOCK',
      pillClass:
        'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200 border border-rose-200/80 dark:border-rose-800/60',
    };
  }
  if (q <= rp * 3) {
    return {
      label: 'MEDIUM',
      pillClass:
        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-600',
    };
  }
  return {
    label: 'HEALTHY',
    pillClass:
      'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50',
  };
}

const DONUT_BLUE = '#1e3a8f';
const DONUT_TRACK = '#e2e8f0';

export type InventoryValuationReportProps = {
  data: { items?: ValItem[]; totalValue?: number };
  onExportCsv: () => void;
  onNewBill?: () => void;
  onManualReconcile?: () => void;
};

export default function InventoryValuationReport({
  data,
  onExportCsv,
  onNewBill,
  onManualReconcile,
}: InventoryValuationReportProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const items = Array.isArray(data.items) ? data.items : [];
  const totalValue = Number(data.totalValue ?? 0);

  const [trendPct, setTrendPct] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState(() => new Date());

  useEffect(() => {
    setLastRun(new Date());
    const k = 'inv_valuation_total_snapshot';
    try {
      const prev = localStorage.getItem(k);
      if (prev != null && totalValue > 0) {
        const p = parseFloat(prev);
        if (p > 0) setTrendPct(((totalValue - p) / p) * 100);
      }
      localStorage.setItem(k, String(totalValue));
    } catch {
      setTrendPct(null);
    }
  }, [totalValue]);

  const distinctCategories = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      if (it.category_id) s.add(String(it.category_id));
    }
    return s.size;
  }, [items]);

  const lowStockCount = useMemo(() => {
    let n = 0;
    for (const it of items) {
      const rp = Math.max(1, Number(it.reorder_point ?? 10) || 10);
      const q = Number(it.quantity_on_hand) || 0;
      if (q <= rp) n += 1;
    }
    return n;
  }, [items]);

  const stockedSkuCount = useMemo(
    () => items.filter((it) => (Number(it.quantity_on_hand) || 0) > 0).length,
    [items]
  );

  const capacityPct = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.min(100, Math.round((stockedSkuCount / items.length) * 100));
  }, [items.length, stockedSkuCount]);

  const top10 = useMemo(() => items.slice(0, 10), [items]);
  const maxBar = useMemo(() => {
    const v = top10[0]?.total_value;
    return Math.max(Number(v) || 0, 1);
  }, [top10]);

  const mix = useMemo(() => {
    const tv = totalValue > 0 ? totalValue : 1;
    let top10Sum = 0;
    for (let i = 0; i < Math.min(10, items.length); i++) {
      top10Sum += Number(items[i]?.total_value) || 0;
    }
    const fast = Math.min(100, (top10Sum / tv) * 100);
    let dead = 0;
    for (const it of items) {
      const rp = Math.max(1, Number(it.reorder_point ?? 10) || 10);
      const q = Number(it.quantity_on_hand) || 0;
      if (q <= rp) dead += Number(it.total_value) || 0;
    }
    const deadPct = Math.min(100, (dead / tv) * 100);
    let optimal = 100 - fast - deadPct;
    if (optimal < 0) optimal = 0;
    const sum = optimal + fast + deadPct;
    if (sum <= 0) return { optimal: 65, fast: 15, dead: 20 };
    return {
      optimal: (optimal / sum) * 100,
      fast: (fast / sum) * 100,
      dead: (deadPct / sum) * 100,
    };
  }, [items, totalValue]);

  const donutData = [
    { name: 'used', value: capacityPct },
    { name: 'free', value: Math.max(0, 100 - capacityPct) },
  ];

  const highest = items[0];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (r) =>
        String(r.name || '')
          .toLowerCase()
          .includes(q) ||
        String(r.sku || '')
          .toLowerCase()
          .includes(q)
    );
  }, [items, search]);

  useEffect(() => {
    setPage(0);
  }, [search, items.length]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => {
    const start = safePage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const exportHandler = useCallback(() => {
    onExportCsv();
  }, [onExportCsv]);

  return (
    <div className="space-y-6 rounded-2xl bg-[#F8F9FC] p-4 dark:bg-slate-950 sm:p-6">
      {/* Title + toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#1e3a8f] dark:text-indigo-400">
            Inventory Valuation
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Weighted average cost · live stock on hand
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-center gap-1 text-slate-500 dark:text-slate-400">
            <button type="button" className="rounded-xl p-2 hover:bg-white/80 dark:hover:bg-slate-800" aria-label="Calendar">
              <Calendar className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <button type="button" className="rounded-xl p-2 hover:bg-white/80 dark:hover:bg-slate-800" aria-label="Notifications">
              <Bell className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <button type="button" className="rounded-xl p-2 hover:bg-white/80 dark:hover:bg-slate-800" aria-label="Settings">
              <Settings className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={exportHandler}
              className="text-sm font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              Export
            </button>
            {onNewBill ? (
              <button
                type="button"
                onClick={onNewBill}
                className="rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#152a45] dark:bg-indigo-700 dark:hover:bg-indigo-600"
              >
                New Bill
              </button>
            ) : null}
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
              aria-hidden
            >
              U
            </span>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total inventory value
            </p>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e3a8f]/10 text-[#1e3a8f] dark:bg-indigo-950/50 dark:text-indigo-400">
              <Wallet className="h-4 w-4" strokeWidth={2} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
            {formatCompactValue(totalValue)}
          </p>
          {trendPct != null && !Number.isNaN(trendPct) ? (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />+
              {Math.abs(trendPct).toFixed(1)}% vs prior snapshot
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">All active SKUs</p>
          )}
        </div>

        <div className="rounded-xl border border-sky-100 bg-sky-50/80 p-5 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active SKUs
            </p>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#1e3a8f] shadow-sm dark:bg-slate-800 dark:text-indigo-400">
              <Layers className="h-4 w-4" strokeWidth={2} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {items.length.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {distinctCategories > 0
              ? `Across ${distinctCategories} ${distinctCategories === 1 ? 'category' : 'categories'}`
              : 'Category tags not set on SKUs'}
          </p>
        </div>

        <div className="rounded-xl border border-rose-100 bg-rose-50/90 p-5 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/25">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Low stock alert
            </p>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-rose-800 dark:text-rose-300">{lowStockCount}</p>
          <p className="mt-2 text-xs font-medium text-rose-700/90 dark:text-rose-400/90">Requires reorder</p>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-5 shadow-sm dark:border-indigo-900/40 dark:bg-indigo-950/25">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Highest value item
            </p>
          </div>
          {highest ? (
            <>
              <p className="mt-3 truncate text-sm font-bold text-slate-900 dark:text-slate-100" title={highest.name}>
                {highest.name}
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {CURRENCY}{' '}
                {Number(highest.total_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="mt-2 inline-flex rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                SKU: {highest.sku || '—'}
              </span>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No data</p>
          )}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Top 10 products by value</h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Allocation based on total inventory investment
              </p>
            </div>
            <a
              href="#valuation-detail"
              className="text-sm font-semibold text-[#1e3a8f] hover:underline dark:text-indigo-400"
            >
              View full report →
            </a>
          </div>
          <div className="mt-6 space-y-4">
            {top10.length === 0 ? (
              <p className="text-sm text-slate-500">No inventory rows yet.</p>
            ) : (
              top10.map((row) => {
                const v = Number(row.total_value) || 0;
                const w = maxBar > 0 ? (v / maxBar) * 100 : 0;
                return (
                  <div key={row.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200" title={row.name}>
                        {row.name}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCompactBar(v)}
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-[#1e3a8f] transition-all dark:bg-indigo-600"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Warehouse status</h3>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-center sm:gap-10">
            <div className="relative h-[180px] w-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={76}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell key="u" fill={DONUT_BLUE} />
                    <Cell key="f" fill={DONUT_TRACK} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{capacityPct}%</span>
              </div>
            </div>
            <div className="max-w-xs text-center sm:text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Capacity used
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Stock coverage across locations
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Share of active SKUs with on-hand quantity
              </p>
            </div>
          </div>
          <div className="mt-8 space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>Optimal storage</span>
                <span className="tabular-nums">{mix.optimal.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-slate-300/90 dark:bg-slate-600"
                  style={{ width: `${mix.optimal}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#1e3a8f] dark:bg-indigo-500" />
                  Fast moving
                </span>
                <span className="tabular-nums">{mix.fast.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-[#1e3a8f] dark:bg-indigo-600"
                  style={{ width: `${mix.fast}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Dead stock risk
                </span>
                <span className="tabular-nums">{mix.dead.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-rose-500/90 dark:bg-rose-600"
                  style={{ width: `${mix.dead}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail table */}
      <div
        id="valuation-detail"
        className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex flex-col gap-4 border-b border-slate-200/80 p-6 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Valuation detail</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Live reconciliation of stock on hand</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by SKU or name…"
                className="w-full min-w-[200px] rounded-full border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#1e3a8f] focus:outline-none focus:ring-2 focus:ring-[#1e3a8f]/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 sm:w-72"
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

        <div className="relative px-6 pt-2">
          <div className="relative z-10 -mb-3 flex flex-wrap items-center justify-center gap-3 rounded-full border border-slate-200/90 bg-white px-4 py-2 text-xs font-semibold shadow-sm dark:border-slate-600 dark:bg-slate-900 sm:justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Live feed
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <Check className="h-3.5 w-3.5 text-[#1e3a8f] dark:text-indigo-400" strokeWidth={2.5} />
              Last valuation run: {lastRun.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
            {onManualReconcile ? (
              <button
                type="button"
                onClick={() => {
                  onManualReconcile();
                  setLastRun(new Date());
                }}
                className="font-semibold text-[#1e3a8f] hover:underline dark:text-indigo-400"
              >
                Manual reconcile
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto px-0 pt-4">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="w-12 px-6 py-3" aria-hidden />
                <th className="px-2 py-3">Product name</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="px-4 py-3 text-right">Total value</th>
                <th className="px-6 py-3">Stock status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center text-slate-500">
                    No rows match your filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const st = stockStatusLabel(r);
                  const qty = Number(r.quantity_on_hand) || 0;
                  const u = r.unit ? ` ${r.unit}` : '';
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-6 py-4">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <Package className="h-4 w-4" strokeWidth={2} />
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate py-4 font-semibold text-slate-900 dark:text-slate-100">
                        {r.name}
                      </td>
                      <td className="py-4 font-mono text-xs text-slate-600 dark:text-slate-300">{r.sku}</td>
                      <td className="py-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {qty.toLocaleString()}
                        {u}
                      </td>
                      <td className="py-4 text-right font-medium tabular-nums text-slate-800 dark:text-slate-200">
                        {CURRENCY}{' '}
                        {Number(r.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {CURRENCY}{' '}
                        {Number(r.total_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${st.pillClass}`}
                        >
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200/80 px-6 py-4 text-sm dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-600 dark:text-slate-400">
            Showing {filtered.length === 0 ? 0 : safePage * pageSize + 1}–
            {Math.min((safePage + 1) * pageSize, filtered.length)} of {filtered.length.toLocaleString()} SKUs
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded-xl bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#152a45] disabled:opacity-40 dark:bg-indigo-700 dark:hover:bg-indigo-600"
            >
              Next page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
