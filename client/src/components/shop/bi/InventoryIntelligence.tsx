import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowRight,
    BarChart2,
    Brain,
    Calendar,
    Download,
    Layers,
    List,
    MapPin,
    ShoppingBag,
    Sparkles,
    Star,
} from 'lucide-react';
import { useBI } from '../../../context/BIContext';
import { accountingApi } from '../../../services/shopApi';
import InventoryAuditWizard from './InventoryAuditWizard';

type CatRow = { category: string; unitsSold: number; revenue?: number; totalSales?: number };
type IqData = Awaited<ReturnType<typeof accountingApi.getInventoryIntelligence>>;

function biDateWindow(preset: string): { from: string; to: string; rangeLabel: string } {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    let start: Date;
    if (preset === 'Today') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (preset === 'MTD') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'QTD') {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), qm, 1);
    } else if (preset === 'YTD') {
        start = new Date(now.getFullYear(), 0, 1);
    } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const rangeLabel =
        {
            Today: 'Today',
            MTD: 'Month to date',
            QTD: 'Quarter to date',
            YTD: 'Year to date',
        }[preset] || preset;
    return { from: start.toISOString(), to: end.toISOString(), rangeLabel };
}

const BAR_COLORS = [
    'bg-[#0f2d5c]',
    'bg-blue-600',
    'bg-sky-500',
    'bg-slate-500',
    'bg-slate-400',
    'bg-slate-300',
    'bg-slate-200',
    'bg-indigo-500',
    'bg-gray-500',
    'bg-zinc-400',
];

const InventoryIntelligence: React.FC = () => {
    const { dateRange, loading: biGlobalLoading } = useBI();
    const navigate = useNavigate();
    const [isAuditWizardOpen, setIsAuditWizardOpen] = useState(false);
    const [distView, setDistView] = useState<'bars' | 'list'>('bars');
    const [data, setData] = useState<IqData | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [localLoading, setLocalLoading] = useState(true);

    const { from, to, rangeLabel } = useMemo(() => biDateWindow(dateRange), [dateRange]);

    const load = useCallback(async () => {
        setLocalLoading(true);
        setLoadError(null);
        try {
            const res = await accountingApi.getInventoryIntelligence(from, to);
            setData(res);
        } catch (e) {
            console.error(e);
            setLoadError('Could not load inventory intelligence. Check your connection and try again.');
            setData(null);
        } finally {
            setLocalLoading(false);
        }
    }, [from, to]);

    useEffect(() => {
        void load();
    }, [load]);

    const categoryRows = useMemo((): CatRow[] => {
        if (!data?.categoryPerformance) return [];
        return (data.categoryPerformance as Record<string, unknown>[]).map((c) => ({
            category: String(c.category ?? 'Uncategorized'),
            unitsSold: parseFloat(String(c.units_sold ?? c.unitsSold ?? 0)) || 0,
        }));
    }, [data]);

    const maxUnits = useMemo(
        () => Math.max(1, ...categoryRows.map((c) => c.unitsSold), 0),
        [categoryRows]
    );

    const topCategory = useMemo(() => {
        if (categoryRows.length === 0) return null;
        return [...categoryRows].sort((a, b) => b.unitsSold - a.unitsSold)[0];
    }, [categoryRows]);

    const slowCategory = useMemo(() => {
        if (categoryRows.length < 2) return null;
        return [...categoryRows].sort((a, b) => a.unitsSold - b.unitsSold)[0];
    }, [categoryRows]);

    const uncVal = (s: string) =>
        s.toLowerCase().includes('uncategor') || s.toLowerCase().includes('unassign');
    const topNeedsTag = topCategory && uncVal(String(topCategory.category));
    const totalUnits = data?.currentTotalUnits ?? 0;
    const totalCategories = new Set(categoryRows.map((c) => c.category)).size;
    const pct = data?.unitsChangePct;
    const newCats = data?.newCategoriesInPeriod ?? 0;
    const varRate = data?.stockVarianceRate ?? 0;
    const isHighVar = varRate > 3;

    const onExport = () => {
        const lines = [
            ['Category', 'Units sold (period)', 'Revenue (if available)'].join(','),
            ...categoryRows.map((r) => {
                const row = (data?.categoryPerformance as any[])?.find((x) => x.category === r.category);
                const rev = row?.revenue != null ? String(row.revenue) : '';
                return [JSON.stringify(r.category), String(r.unitsSold), rev].join(',');
            }),
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `inventory-iq-${dateRange}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const goCategories = () => navigate('/inventory?tab=categories');
    const loading = biGlobalLoading || localLoading;

    return (
        <div className="space-y-8 animate-in zoom-in duration-500">
            {/* Page header (matches Intelligence Engine time range) */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                        Supply Chain &amp; Inventory IQ
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
                        Comprehensive breakdown of inventory movement across core categories, aligned to the date range
                        above.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        title="Uses the same range as Intelligence Engine (header)"
                    >
                        <Calendar className="h-4 w-4 text-slate-500" />
                        {rangeLabel}
                    </div>
                    <button
                        type="button"
                        onClick={onExport}
                        disabled={!data || categoryRows.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/80"
                    >
                        <Download className="h-4 w-4" />
                        Export
                    </button>
                </div>
            </div>

            {loadError && (
                <p className="text-sm text-amber-600 dark:text-amber-400" role="alert">
                    {loadError}
                </p>
            )}

            {/* Metric cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900/80">
                    <div className="mb-3 flex items-start justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                            <Layers className="h-5 w-5" />
                        </div>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            CAT_TRK_01
                        </span>
                    </div>
                    {loading ? (
                        <div className="h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    ) : (
                        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalCategories}</p>
                    )}
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">Categories Tracked</p>
                    {newCats > 0 && (
                        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <span className="text-[10px]">▲</span>+{newCats} new this month
                        </p>
                    )}
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900/80">
                    <div className="mb-3 flex items-start justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <ShoppingBag className="h-5 w-5" />
                        </div>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            UNITS_SLD
                        </span>
                    </div>
                    {loading ? (
                        <div className="h-8 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    ) : (
                        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                            {totalUnits > 0 ? totalUnits.toLocaleString() : '0'}
                        </p>
                    )}
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">Total Units Sold</p>
                    {pct != null && !loading && totalUnits > 0 && (
                        <p
                            className={`mt-2 flex items-center gap-1 text-xs font-semibold ${
                                (pct as number) >= 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                            }`}
                        >
                            <span className="text-[10px]">{(pct as number) >= 0 ? '▲' : '▼'}</span>
                            {Math.abs(pct as number).toFixed(1)}% vs last period
                        </p>
                    )}
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900/80">
                    <div className="mb-3 flex items-start justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
                            <Star className="h-5 w-5" />
                        </div>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            TOP_CAT
                        </span>
                    </div>
                    {loading ? (
                        <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    ) : (
                        <p className="truncate text-xl font-bold text-slate-900 dark:text-slate-100" title={topCategory?.category}>
                            {topCategory ? topCategory.category : '—'}
                        </p>
                    )}
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">Top Category</p>
                    {topNeedsTag && !loading && (
                        <p className="mt-2 text-[11px] font-medium uppercase text-slate-400">Requires manual tagging</p>
                    )}
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900/80">
                    <div className="mb-3 flex items-start justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            STK_ERR
                        </span>
                    </div>
                    {loading ? (
                        <div className="h-8 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    ) : (
                        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{varRate.toFixed(1)}%</p>
                    )}
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">Stock Variance Rate</p>
                    {!loading && isHighVar && (
                        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                            <span className="text-[10px]">▼</span> High alert status
                        </p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {/* Category distribution */}
                <div className="xl:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-slate-900/80">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">
                                Category distribution
                            </h3>
                            <p className="text-xs text-slate-500">Unit count breakdown per operational category.</p>
                        </div>
                        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-600">
                            <button
                                type="button"
                                onClick={() => setDistView('bars')}
                                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                                    distView === 'bars'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                <BarChart2 className="h-3.5 w-3.5" />
                                Bars
                            </button>
                            <button
                                type="button"
                                onClick={() => setDistView('list')}
                                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                                    distView === 'list'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                <List className="h-3.5 w-3.5" />
                                List
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                    ) : categoryRows.length === 0 || totalUnits === 0 ? (
                        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                            No sales in this range yet. When POS sales are recorded, distribution appears here.
                        </div>
                    ) : distView === 'bars' ? (
                        <ul className="space-y-3">
                            {categoryRows.slice(0, 8).map((c, i) => {
                                const w = (c.unitsSold / maxUnits) * 100;
                                return (
                                    <li key={c.category + i} className="min-w-0">
                                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                            <span
                                                className="max-w-[55%] truncate font-semibold uppercase text-slate-600 dark:text-slate-300"
                                                title={c.category}
                                            >
                                                {c.category}
                                            </span>
                                            <span className="shrink-0 font-mono text-slate-700 dark:text-slate-200">
                                                {c.unitsSold.toLocaleString()} units
                                            </span>
                                        </div>
                                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div
                                                className={`h-full min-w-[3px] rounded-full transition-all ${BAR_COLORS[i % BAR_COLORS.length]}`}
                                                style={{ width: `${w}%` }}
                                            />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <ol className="space-y-2 text-sm">
                            {categoryRows.map((c, i) => (
                                <li
                                    key={c.category + i}
                                    className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-700/80"
                                >
                                    <span className="max-w-[70%] truncate font-medium text-slate-800 dark:text-slate-200">
                                        {c.category}
                                    </span>
                                    <span className="text-slate-500">{c.unitsSold.toLocaleString()}</span>
                                </li>
                            ))}
                        </ol>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-700/80">
                        <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-[#0f2d5c]" />
                                Primary
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                                Secondary
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={goCategories}
                            className="inline-flex items-center gap-0.5 font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                            View all categories
                            <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* Right column: Movement IQ + map */}
                <div className="space-y-6">
                    <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0b1a33] p-5 text-white shadow-md">
                        <div className="mb-3 flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                                <Brain className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-200">Movement IQ analysis</h3>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                                    Prioritization from sales velocity, uncategorized exposure, and stock variance vs on-hand
                                    baselines.
                                </p>
                            </div>
                        </div>
                        <div className="mb-3 grid gap-2">
                            <div className="rounded-xl bg-slate-950/50 p-3 ring-1 ring-white/5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90">Top seller alert</p>
                                {loading ? (
                                    <div className="mt-1 h-4 w-2/3 animate-pulse rounded bg-slate-700" />
                                ) : (
                                    <p className="mt-0.5 truncate text-sm font-semibold text-white" title={topCategory?.category}>
                                        {topCategory?.category || '—'}
                                    </p>
                                )}
                                <p className="text-[11px] text-slate-400">
                                    {topNeedsTag ? 'Needs tagging immediately' : 'Top velocity category in this period.'}
                                </p>
                                <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                                    {topCategory ? topCategory.unitsSold.toLocaleString() : '—'}
                                </p>
                            </div>
                            {slowCategory && topCategory && slowCategory.category !== topCategory.category && (
                                <div className="rounded-xl bg-slate-950/50 p-3 ring-1 ring-white/5">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Slowest category</p>
                                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-200" title={slowCategory.category}>
                                        {slowCategory.category}
                                    </p>
                                    <p className="text-[11px] text-slate-500">Stagnant vs peers in the same range.</p>
                                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-200">
                                        {slowCategory.unitsSold.toLocaleString()}
                                    </p>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsAuditWizardOpen(true)}
                            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-bold uppercase tracking-widest text-slate-900 transition hover:bg-slate-100"
                        >
                            <Sparkles className="h-4 w-4" />
                            Inventory audit wizard
                        </button>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900/80">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">
                            Stock level map
                        </h3>
                        <div className="relative mt-3 aspect-[2/1] overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800/80">
                            <div className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-slate-500">
                                <div className="h-full w-4/5 rounded border border-slate-400/40 bg-slate-300/30 dark:border-slate-500/30 dark:bg-slate-700/40" />
                            </div>
                            <div className="absolute left-[42%] top-[32%] flex h-8 w-8 items-center justify-center rounded border-2 border-blue-500 bg-blue-500/20">
                                <MapPin className="h-4 w-4 text-blue-200" />
                            </div>
                            {['left-[18%]', 'left-[32%]', 'left-[60%]'].map((c) => (
                                <div
                                    key={c}
                                    className={`absolute top-0 h-full w-px ${c} bg-gradient-to-b from-transparent via-white/30 to-transparent`}
                                />
                            ))}
                        </div>
                        {data?.warehouses && data.warehouses.length > 0 ? (
                            <ul className="mt-3 space-y-1.5 text-xs">
                                {data.warehouses.map((w) => (
                                    <li key={w.name} className="flex items-center justify-between gap-2">
                                        <span className="text-slate-600 dark:text-slate-300">{w.name}</span>
                                        {w.status === 'warning' ? (
                                            <span className="font-bold uppercase text-amber-500">Warning</span>
                                        ) : (
                                            <span className="font-bold uppercase text-emerald-600">Optimized</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : !loading ? (
                            <p className="mt-3 text-xs text-slate-500">No warehouse rows yet. Add locations under inventory settings when available.</p>
                        ) : null}
                    </div>
                </div>
            </div>

            <InventoryAuditWizard isOpen={isAuditWizardOpen} onClose={() => setIsAuditWizardOpen(false)} />
        </div>
    );
};

export default InventoryIntelligence;
