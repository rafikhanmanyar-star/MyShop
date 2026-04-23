import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { procurementDemandApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Filter,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';

interface DemandItem {
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string | null;
  current_stock: number;
  avg_daily_sales: number;
  days_of_stock: number | null;
  suggested_order_qty: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_DATA';
  cost_price: number;
  retail_price: number;
}

interface DemandSettings {
  salesWindowDays: number;
  minimumDaysThreshold: number;
  targetStockDays: number;
}

interface DemandSummary {
  total_products: number;
  high_priority: number;
  medium_priority: number;
  low_priority: number;
  no_data: number;
  estimated_purchase_cost: number;
}

type SortKey =
  | 'product_name'
  | 'current_stock'
  | 'avg_daily_sales'
  | 'days_of_stock'
  | 'suggested_order_qty'
  | 'priority'
  | 'cost_price';
type FilterMode = 'all' | 'high' | 'medium' | 'low_stock' | 'fast_moving' | 'needs_order';

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NO_DATA: 3 };

function formatCompactCurrency(amount: number, currency: string): string {
  const a = Math.abs(amount);
  if (a >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1_000) return `${currency} ${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const styles: Record<string, string> = {
    HIGH: 'bg-red-50 text-[#EF4444] border border-red-200',
    MEDIUM: 'bg-amber-50 text-[#F59E0B] border border-amber-200',
    LOW: 'bg-emerald-50 text-[#10B981] border border-emerald-200',
    NO_DATA: 'bg-slate-100 text-slate-500 border border-slate-200',
  };
  const label = priority === 'NO_DATA' ? 'NO DATA' : priority;
  return (
    <span
      className={`inline-flex min-w-[5.5rem] justify-center rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide ${styles[priority] || styles.NO_DATA}`}
    >
      {label}
    </span>
  );
};

const DaysLeftBadge: React.FC<{ days: number | null }> = ({ days }) => {
  if (days === null) {
    return (
      <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
        N/A
      </span>
    );
  }
  const d = Math.max(0, Math.floor(days));
  const isUrgent = d <= 3;
  const isOk = d > 7;
  const cls = isUrgent
    ? 'border-red-200 bg-red-50 text-[#EF4444]'
    : isOk
      ? 'border-emerald-200 bg-emerald-50 text-[#10B981]'
      : 'border-amber-200 bg-amber-50 text-[#F59E0B]';
  return (
    <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {d} {d === 1 ? 'day' : 'days'}
    </span>
  );
};

type KpiBarColor = 'primary' | 'danger' | 'warning' | 'success' | 'muted';

const KpiCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  sublabelTone?: 'danger' | 'warning' | 'success' | 'muted';
  bar: KpiBarColor;
  className?: string;
  extra?: React.ReactNode;
}> = ({ label, value, sublabel, sublabelTone = 'muted', bar, className, extra }) => {
  const barCls: Record<KpiBarColor, string> = {
    primary: 'bg-[#4F46E5]',
    danger: 'bg-[#EF4444]',
    warning: 'bg-[#F59E0B]',
    success: 'bg-[#10B981]',
    muted: 'bg-slate-300 dark:bg-slate-500',
  };
  const subCls = {
    danger: 'text-[#EF4444]',
    warning: 'text-[#F59E0B]',
    success: 'text-[#10B981]',
    muted: 'text-slate-500',
  };
  return (
    <div
      className={`relative flex min-h-[5.5rem] overflow-hidden rounded-[10px] border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80 ${className ?? ''}`}
    >
      <div className={`w-1 shrink-0 self-stretch ${barCls[bar]}`} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col justify-center px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
          <p className="text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
          {extra}
        </div>
        {sublabel != null && <p className={`mt-0.5 text-xs font-medium ${subCls[sublabelTone]}`}>{sublabel}</p>}
      </div>
    </div>
  );
};

function stockBarPercent(
  item: DemandItem,
  targetStockDays: number
): { pct: number; tone: 'danger' | 'warning' | 'success' } {
  const targetUnits = (item.avg_daily_sales || 0) * targetStockDays;
  const full = targetUnits > 0 ? targetUnits : Math.max(item.current_stock, 1);
  const raw = full > 0 ? (item.current_stock / full) * 100 : 0;
  const pct = Math.max(0, Math.min(100, raw));
  const tone: 'danger' | 'warning' | 'success' =
    pct < 30 ? 'danger' : pct < 70 ? 'warning' : 'success';
  return { pct, tone };
}

function lastUpdateLabel(iso: string | null): string {
  if (!iso) return '—';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m === 1) return '1 min ago';
  return `${m} mins ago`;
}

const PAGE_SIZE = 15;

const ProcurementDemand: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DemandItem[]>([]);
  const [summary, setSummary] = useState<DemandSummary | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [settings, setSettings] = useState<DemandSettings>({
    salesWindowDays: 7,
    minimumDaysThreshold: 5,
    targetStockDays: 15,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftModalItems, setDraftModalItems] = useState<DemandItem[]>([]);
  const [page, setPage] = useState(1);
  const [draftsTodayCount, setDraftsTodayCount] = useState(0);
  const prevProductTotalRef = useRef<number | null>(null);
  const [productGrowthPct, setProductGrowthPct] = useState<number | null>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await procurementDemandApi.analyze(settings);
      const nextItems: DemandItem[] = result.items || [];
      setItems(nextItems);
      setSummary(result.summary || null);
      setGeneratedAt(result.generated_at || new Date().toISOString());
      setPage(1);

      const n = nextItems.length;
      if (prevProductTotalRef.current != null) {
        const p = prevProductTotalRef.current;
        if (p > 0) {
          setProductGrowthPct(Math.round(((n - p) / p) * 1000) / 10);
        } else {
          setProductGrowthPct(n > 0 ? 100 : 0);
        }
      }
      prevProductTotalRef.current = n;

      try {
        const drafts = await procurementDemandApi.getDrafts();
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const c = (drafts as { created_at?: string }[]).filter(
          d => d.created_at && new Date(d.created_at) >= start
        ).length;
        setDraftsTodayCount(c);
      } catch {
        setDraftsTodayCount(0);
      }
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    runAnalysis();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />;
  };

  const filtered = useMemo(() => {
    let list = [...items];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        i =>
          i.product_name.toLowerCase().includes(q) ||
          (i.sku && i.sku.toLowerCase().includes(q)) ||
          (i.category_name && i.category_name.toLowerCase().includes(q))
      );
    }

    switch (filterMode) {
      case 'high':
        list = list.filter(i => i.priority === 'HIGH');
        break;
      case 'medium':
        list = list.filter(i => i.priority === 'MEDIUM');
        break;
      case 'low_stock':
        list = list.filter(
          i =>
            i.current_stock <= 0 ||
            (i.days_of_stock !== null && i.days_of_stock <= settings.minimumDaysThreshold)
        );
        break;
      case 'fast_moving':
        list = list.filter(i => i.avg_daily_sales > 0);
        list.sort((a, b) => b.avg_daily_sales - a.avg_daily_sales);
        break;
      case 'needs_order':
        list = list.filter(i => i.suggested_order_qty > 0);
        break;
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'product_name':
          cmp = a.product_name.localeCompare(b.product_name);
          break;
        case 'current_stock':
          cmp = a.current_stock - b.current_stock;
          break;
        case 'avg_daily_sales':
          cmp = a.avg_daily_sales - b.avg_daily_sales;
          break;
        case 'days_of_stock':
          cmp = (a.days_of_stock ?? 9999) - (b.days_of_stock ?? 9999);
          break;
        case 'suggested_order_qty':
          cmp = a.suggested_order_qty - b.suggested_order_qty;
          break;
        case 'priority':
          cmp = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
          break;
        case 'cost_price':
          cmp = a.cost_price - b.cost_price;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [items, search, filterMode, sortKey, sortDir, settings.minimumDaysThreshold]);

  const ordersPipelineTotal = useMemo(
    () =>
      items.reduce((s, i) => s + (i.suggested_order_qty > 0 ? i.suggested_order_qty * i.cost_price : 0), 0),
    [items]
  );

  const bulkOrderItems = useMemo(
    () => items.filter(i => i.suggested_order_qty > 0),
    [items]
  );

  const openBulkOrderModal = useCallback(() => {
    if (bulkOrderItems.length === 0) return;
    setDraftModalItems(bulkOrderItems);
    setDraftName(`Purchase List ${new Date().toLocaleDateString()}`);
    setShowDraftModal(true);
  }, [bulkOrderItems]);

  const draftModalCost = useMemo(
    () => draftModalItems.reduce((sum, i) => sum + i.suggested_order_qty * i.cost_price, 0),
    [draftModalItems]
  );

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search, filterMode]);

  const handleSaveDraft = async () => {
    if (draftModalItems.length === 0) return;
    setSaving(true);
    try {
      const draftItems = draftModalItems.map(i => ({
        productId: i.product_id,
        suggestedQty: i.suggested_order_qty,
        finalQty: i.suggested_order_qty,
        currentStock: i.current_stock,
        avgDailySales: i.avg_daily_sales,
        daysOfStock: i.days_of_stock,
        priority: i.priority,
      }));
      await procurementDemandApi.saveDraft({
        name: draftName || `Purchase List ${new Date().toLocaleDateString()}`,
        items: draftItems,
        settings,
      });
      setShowDraftModal(false);
      setDraftName('');
      setDraftModalItems([]);
      void runAnalysis();
    } catch (e: any) {
      setError(e?.error || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const rows = [
      [
        'Product',
        'SKU',
        'Category',
        'Stock',
        'Avg Daily Sales',
        'Days of Stock',
        'Suggested Qty',
        'Priority',
        'Est. Cost',
      ],
      ...filtered.map(i => [
        i.product_name,
        i.sku,
        i.category_name || '',
        i.current_stock,
        i.avg_daily_sales,
        i.days_of_stock ?? 'N/A',
        i.suggested_order_qty,
        i.priority,
        (i.suggested_order_qty * i.cost_price).toFixed(2),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `procurement-demand-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filters: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All Products' },
    { key: 'high', label: 'High Priority' },
    { key: 'medium', label: 'Medium Priority' },
    { key: 'low_stock', label: 'Low Stock' },
    { key: 'fast_moving', label: 'Fast Moving' },
    { key: 'needs_order', label: 'Needs Order' },
  ];

  const paginationNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    for (const p of [...pages]) {
      if (p < 1 || p > totalPages) pages.delete(p);
    }
    return [...pages].sort((a, b) => a - b);
  }, [page, totalPages]);

  const fromIdx = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx = Math.min(page * PAGE_SIZE, filtered.length);

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200/90 bg-[#F8F9FB] p-4 shadow-sm sm:p-6 dark:border-slate-700/80 dark:bg-slate-900/40">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Total Products"
            value={summary.total_products.toLocaleString()}
            bar="primary"
            extra={
              productGrowthPct != null && prevProductTotalRef.current != null ? (
                <span
                  className={`text-xs font-bold ${productGrowthPct >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}
                >
                  {productGrowthPct >= 0 ? '+' : ''}
                  {productGrowthPct}%
                </span>
              ) : (
                <span className="text-xs font-medium text-slate-400">First run</span>
              )
            }
          />
          <KpiCard
            label="High Priority"
            value={summary.high_priority}
            sublabel="Critical"
            sublabelTone="danger"
            bar="danger"
          />
          <KpiCard
            label="Medium Priority"
            value={summary.medium_priority}
            sublabel="Attention"
            sublabelTone="warning"
            bar="warning"
          />
          <KpiCard
            label="Low Priority"
            value={summary.low_priority}
            sublabel="Stable"
            sublabelTone="success"
            bar="success"
          />
          <KpiCard
            label="No Data"
            value={summary.no_data}
            sublabel="Unmapped"
            sublabelTone="muted"
            bar="muted"
          />
          <KpiCard
            label="Est. Purchase Cost"
            value={formatCompactCurrency(summary.estimated_purchase_cost, CURRENCY)}
            className="min-w-0 sm:min-w-[12rem] lg:min-w-[10rem]"
            bar="primary"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-4">
        <div className="relative min-w-0 max-w-md flex-1">
          <input
            type="search"
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-10 w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/25 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            aria-label="Search products"
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {filters.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterMode(f.key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                filterMode === f.key
                  ? 'bg-[#4F46E5] text-white shadow-sm shadow-indigo-500/25'
                  : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(s => !s)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            title="Analysis settings"
            aria-expanded={showSettings}
          >
            <Filter className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-[#4F46E5] px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <Inbox className="h-4 w-4" />
            CSV
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800/80">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Analysis settings</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="pd-sales-window" className="mb-1 block text-xs font-medium text-slate-500">
                Sales window (days)
              </label>
              <input
                id="pd-sales-window"
                type="number"
                min={1}
                max={90}
                value={settings.salesWindowDays}
                onChange={e =>
                  setSettings(s => ({ ...s, salesWindowDays: Math.max(1, parseInt(e.target.value, 10) || 7) }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
            <div>
              <label htmlFor="pd-min-threshold" className="mb-1 block text-xs font-medium text-slate-500">
                Min. days threshold
              </label>
              <input
                id="pd-min-threshold"
                type="number"
                min={1}
                max={30}
                value={settings.minimumDaysThreshold}
                onChange={e =>
                  setSettings(s => ({
                    ...s,
                    minimumDaysThreshold: Math.max(1, parseInt(e.target.value, 10) || 5),
                  }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
            <div>
              <label htmlFor="pd-target-stock" className="mb-1 block text-xs font-medium text-slate-500">
                Target stock (days)
              </label>
              <input
                id="pd-target-stock"
                type="number"
                min={1}
                max={90}
                value={settings.targetStockDays}
                onChange={e =>
                  setSettings(s => ({ ...s, targetStockDays: Math.max(1, parseInt(e.target.value, 10) || 15) }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            className="mt-3 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            Apply and refresh
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center rounded-[10px] border border-slate-200 bg-white py-20 dark:border-slate-600 dark:bg-slate-800/50">
          <Loader2 className="h-8 w-8 animate-spin text-[#4F46E5]" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-slate-200/90 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800/50">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-800/50">
                  {(
                    [
                      ['product_name', 'Product / SKU'],
                      ['current_stock', 'Current stock'],
                      ['avg_daily_sales', 'Avg / day'],
                      ['days_of_stock', 'Days left'],
                      ['suggested_order_qty', 'Suggested qty'],
                      ['cost_price', 'Est. cost'],
                      ['priority', 'Priority'],
                    ] as [SortKey, string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className="cursor-pointer select-none px-3 py-3.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 transition hover:text-slate-800 dark:text-slate-400"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/80">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-14 text-center text-slate-500">
                      {items.length === 0 ? 'No product data available.' : 'No products match current filters.'}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map(item => {
                    const { pct, tone } = stockBarPercent(item, settings.targetStockDays);
                    const barClass =
                      tone === 'danger'
                        ? 'bg-[#EF4444]'
                        : tone === 'warning'
                          ? 'bg-[#F59E0B]'
                          : 'bg-[#10B981]';
                    const rowBg =
                      item.priority === 'HIGH'
                        ? 'bg-red-50/40 dark:bg-red-950/20'
                        : item.priority === 'MEDIUM'
                          ? 'bg-amber-50/30 dark:bg-amber-950/10'
                          : '';
                    return (
                      <tr
                        key={item.product_id}
                        className={`${rowBg} transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40`}
                      >
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{item.product_name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">{item.sku || '—'}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex min-w-[7rem] items-center gap-2">
                            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                              <div
                                className={`h-full rounded-full transition-all ${barClass}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="shrink-0 text-xs font-medium tabular-nums text-slate-700 dark:text-slate-300">
                              {item.current_stock} {item.current_stock === 1 ? 'unit' : 'units'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                          {item.avg_daily_sales}
                        </td>
                        <td className="px-3 py-3">
                          <DaysLeftBadge days={item.days_of_stock} />
                        </td>
                        <td className="px-3 py-3 text-sm font-bold tabular-nums text-[#4F46E5]">
                          {item.suggested_order_qty > 0 ? item.suggested_order_qty : '—'}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                          {item.suggested_order_qty > 0
                            ? `${CURRENCY} ${(item.suggested_order_qty * item.cost_price).toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              })}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <PriorityBadge priority={item.priority} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {generatedAt && (
            <div className="flex flex-col items-start justify-between gap-3 border-t border-slate-200 px-3 py-3 text-xs sm:flex-row sm:items-center dark:border-slate-600">
              <p className="text-slate-500 dark:text-slate-400">
                Showing {fromIdx} to {toIdx} of {filtered.length.toLocaleString()} product{filtered.length === 1 ? '' : 's'}
                {items.length !== filtered.length && (
                  <span className="text-slate-400"> ({items.length} total in analysis)</span>
                )}
                .
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                {paginationNumbers.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`min-w-8 rounded-md px-2.5 py-1.5 text-xs font-bold ${
                      page === n
                        ? 'bg-[#4F46E5] text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="flex min-h-[7.5rem] flex-col justify-between gap-3 rounded-[10px] bg-[#1e3a5f] p-4 text-white shadow-md sm:flex-row sm:items-center sm:p-5 lg:col-span-3">
          <div>
            <p className="text-xs font-medium text-white/80">Finalized orders today</p>
            <p className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">
              {CURRENCY}{' '}
              {(summary?.estimated_purchase_cost ?? ordersPipelineTotal).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="mt-1 text-sm text-white/80">
              {draftsTodayCount} purchase {draftsTodayCount === 1 ? 'order' : 'orders'} generated
            </p>
          </div>
          <button
            type="button"
            onClick={openBulkOrderModal}
            disabled={bulkOrderItems.length === 0}
            className="shrink-0 rounded-[10px] bg-white px-4 py-2.5 text-sm font-bold text-[#1e3a5f] shadow transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bulk order all
          </button>
        </div>
        <div className="flex min-h-[7.5rem] gap-3 rounded-[10px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800/50 lg:col-span-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#10B981] text-white">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">System health: Optimal</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Demand forecasting engine synced with live sales data. Last update: {lastUpdateLabel(generatedAt)}. Window:{' '}
              {settings.salesWindowDays}d, target: {settings.targetStockDays}d.
            </p>
          </div>
        </div>
      </div>

      {showDraftModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDraftModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Save purchase draft</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {draftModalItems.length} line{draftModalItems.length === 1 ? '' : 's'} will be saved.
            </p>
            <label className="mt-3 block text-sm font-medium text-slate-800 dark:text-slate-200" htmlFor="pd-draft-name">
              Draft name
            </label>
            <input
              id="pd-draft-name"
              type="text"
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              placeholder="e.g. Weekly restock"
              autoFocus
            />
            <div className="mt-4 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm dark:border-slate-600 dark:bg-slate-900/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Total items</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{draftModalItems.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Estimated cost</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {CURRENCY} {draftModalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDraftModal(false);
                  setDraftModalItems([]);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving}
                className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcurementDemand;
