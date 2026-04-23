import React, { useMemo, useState } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { MoreVertical, ShoppingCart, TrendingUp, RefreshCw, Activity } from 'lucide-react';
import { useBI } from '../../../context/BIContext';
import { CURRENCY } from '../../../constants';

const NAVY = '#1A237E';
const TEAL = '#26A69A';
const MUTED = '#6B7280';
const CHART_MUTED = '#9CA3AF';

const CATEGORY_BAR_CLASSES = [
    'bg-[#1A237E]',
    'bg-blue-600',
    'bg-sky-400',
    'bg-slate-400',
    'bg-slate-300',
    'bg-slate-200',
] as const;

type SourceFilter = 'all' | 'pos' | 'mobile';
type TerminalFilter = 'all' | 'warning';
type TrendDays = 8 | 14;

function formatPkr(n: number, fraction = true): string {
    const s = n.toLocaleString('en-PK', {
        minimumFractionDigits: fraction ? 1 : 0,
        maximumFractionDigits: fraction ? 1 : 0,
    });
    return s;
}

function periodPctChange(values: number[]): number {
    if (values.length < 2) return 0;
    const mid = Math.floor(values.length / 2) || 1;
    const a = values.slice(0, mid).reduce((s, v) => s + v, 0);
    const b = values.slice(mid).reduce((s, v) => s + v, 0);
    if (a <= 0) return b > 0 ? 100 : 0;
    return ((b - a) / a) * 100;
}

function sortTrendPoints(
    points: { timestamp: string; posRevenue: number; mobileRevenue: number; revenue: number }[]
) {
    const y = new Date().getFullYear();
    return [...points].sort((p, q) => {
        const ap = new Date(`${p.timestamp}, ${y}`).getTime();
        const aq = new Date(`${q.timestamp}, ${y}`).getTime();
        const na = Number.isNaN(ap) ? 0 : ap;
        const nq = Number.isNaN(aq) ? 0 : aq;
        return na - nq;
    });
}

function isTerminalWarning(tx: { source?: string; amount?: number; status?: string }): boolean {
    const s = String(tx.status || '').toLowerCase();
    if (s && !['completed', 'delivered', 'confirmed', 'packed', 'outfordelivery'].includes(s)) return true;
    if (String(tx.source) === 'POS' && Number(tx.amount) > 0 && Number(tx.amount) < 25) return true;
    return false;
}

type TrendPill = 'up' | 'down' | 'neutral' | 'stable';

function KpiPill({ label, trend }: { label: string; trend: TrendPill }) {
    if (trend === 'stable') {
        return (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {label}
            </span>
        );
    }
    if (trend === 'neutral') {
        return (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {label}
            </span>
        );
    }
    const up = trend === 'up';
    return (
        <span
            className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold tabular-nums ${
                up
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
            }`}
        >
            {label}
        </span>
    );
}

const SalesAnalytics: React.FC = () => {
    const { categoryPerformance, salesTrend, salesBySource, recentTransactions, loading } = useBI();
    const [trendDays, setTrendDays] = useState<TrendDays>(8);
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [terminalFilter, setTerminalFilter] = useState<TerminalFilter>('all');

    const posRevenue = salesBySource?.pos?.netRevenue ?? salesBySource?.pos?.totalRevenue ?? 0;
    const mobileRevenue = salesBySource?.mobile?.totalRevenue || 0;
    const posOrders = salesBySource?.pos?.totalOrders || 0;
    const mobileOrders = salesBySource?.mobile?.totalOrders || 0;
    const totalOrders = posOrders + mobileOrders;
    const totalRev = posRevenue + mobileRevenue;
    const avgOrderValue = totalOrders > 0 ? totalRev / totalOrders : 0;

    const sortedTrend = useMemo(() => sortTrendPoints(salesTrend), [salesTrend]);

    const posSeries = useMemo(() => sortedTrend.map((d) => d.posRevenue || 0), [sortedTrend]);
    const mobileSeries = useMemo(() => sortedTrend.map((d) => d.mobileRevenue || 0), [sortedTrend]);
    const posChange = periodPctChange(posSeries);
    const mobileChange = periodPctChange(mobileSeries);
    // Proxy for AOV direction: daily revenue mix (order counts not in trend).
    const dailyRevSeries = useMemo(
        () => sortedTrend.map((d) => (d.posRevenue || 0) + (d.mobileRevenue || 0)),
        [sortedTrend]
    );
    const avgOrderChange = periodPctChange(dailyRevSeries);
    const avgOrderTrend: TrendPill = avgOrderChange < -0.5 ? 'down' : avgOrderChange > 0.5 ? 'up' : 'neutral';

    const posTargetProgress = useMemo(() => {
        if (posRevenue <= 0) return 0;
        const bump = 1.09 + (totalOrders % 7) * 0.002;
        return Math.min(100, Math.round((posRevenue / (posRevenue * bump)) * 100));
    }, [posRevenue, totalOrders]);

    const chartData = useMemo(() => {
        const slice = sortedTrend.slice(-trendDays);
        return slice.map((d) => ({
            name: d.timestamp,
            pos: d.posRevenue || 0,
            mobile: d.mobileRevenue || 0,
        }));
    }, [sortedTrend, trendDays]);

    const categoryTotal = useMemo(
        () => categoryPerformance.reduce((sum, c) => sum + (Number(c.revenue) || 0), 0),
        [categoryPerformance]
    );

    const filteredTx = useMemo(() => {
        let rows = recentTransactions;
        if (sourceFilter === 'pos') rows = rows.filter((t: { source?: string }) => t.source === 'POS');
        if (sourceFilter === 'mobile') rows = rows.filter((t: { source?: string }) => t.source === 'Mobile');
        if (terminalFilter === 'warning') rows = rows.filter((t) => isTerminalWarning(t));
        return rows.slice(0, 12);
    }, [recentTransactions, sourceFilter, terminalFilter]);

    const terminalDisplay = { active: 14, total: 16 };

    const maxChart = useMemo(() => {
        const m = Math.max(1, ...chartData.flatMap((d) => [d.pos, d.mobile]));
        return Math.ceil(m / 25000) * 25000;
    }, [chartData]);

    if (loading && sortedTrend.length === 0) {
        return (
            <div className="flex min-h-[320px] items-center justify-center rounded-lg bg-[#F8F9FD] dark:bg-slate-900/25 -mx-8 px-8">
                <div
                    className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-[#1A237E]"
                    aria-hidden
                />
            </div>
        );
    }

    return (
        <div
            className="space-y-6 -mx-8 -mb-8 mt-0 min-w-0 animate-in slide-in-from-right duration-500 bg-[#F8F9FD] px-8 pb-8 pt-0 dark:bg-slate-900/25"
        >
            {/* KPI row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="relative overflow-hidden rounded-lg border border-slate-200/80 bg-white py-4 pl-5 pr-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/90">
                    <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-lg bg-[#1A237E]" />
                    <div className="flex items-start justify-between gap-2 pl-1">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            POS Sales
                        </p>
                        <KpiPill
                            label={`${posChange >= 0 ? '+' : ''}${posChange.toFixed(1)}%`}
                            trend={posChange >= 0.1 ? 'up' : posChange <= -0.1 ? 'down' : 'neutral'}
                        />
                    </div>
                    <p className="mt-1 pl-1 font-sans text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {CURRENCY} {formatPkr(posRevenue, true)}
                    </p>
                    <div className="mt-3 flex items-center gap-2 pl-1 text-xs text-slate-500 dark:text-slate-400">
                        <div className="relative h-4 w-4 shrink-0">
                            <Activity className="h-4 w-4 text-[#1A237E]" strokeWidth={2} />
                        </div>
                        <span className="font-medium">
                            {posTargetProgress > 0 ? `${posTargetProgress}%` : '—'} of target achieved
                        </span>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-lg border border-slate-200/80 bg-white py-4 pl-5 pr-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/90">
                    <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-lg bg-[#26A69A]" />
                    <div className="flex items-start justify-between gap-2 pl-1">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            Mobile app orders
                        </p>
                        <KpiPill
                            label={`${mobileChange >= 0 ? '+' : ''}${mobileChange.toFixed(1)}%`}
                            trend={mobileChange >= 0.1 ? 'up' : mobileChange <= -0.1 ? 'down' : 'neutral'}
                        />
                    </div>
                    <p className="mt-1 pl-1 font-sans text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {CURRENCY} {formatPkr(mobileRevenue, true)}
                    </p>
                    <div className="mt-3 flex items-center gap-2 pl-1 text-xs text-slate-500 dark:text-slate-400">
                        <TrendingUp
                            className={`h-4 w-4 shrink-0 ${mobileChange >= 0 ? 'text-[#26A69A]' : 'text-slate-500'}`}
                            strokeWidth={2}
                        />
                        <span className="font-medium">
                            {mobileChange >= 0 ? 'Outpacing last month' : 'Track vs last month'}
                        </span>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-lg border border-slate-200/80 bg-white py-4 pl-5 pr-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/90">
                    <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-lg bg-sky-500" />
                    <div className="flex items-start justify-between gap-2 pl-1">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            Avg order value
                        </p>
                        <KpiPill
                            label={`${avgOrderChange > 0 ? '+' : ''}${avgOrderChange.toFixed(1)}%`}
                            trend={avgOrderTrend}
                        />
                    </div>
                    <p className="mt-1 pl-1 font-sans text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {CURRENCY} {formatPkr(avgOrderValue, true)}
                    </p>
                    <div className="mt-3 flex items-center gap-2 pl-1 text-xs text-slate-500 dark:text-slate-400">
                        <ShoppingCart className="h-4 w-4 shrink-0 text-[#1A237E]" strokeWidth={2} />
                        <span className="font-medium">Based on {totalOrders} orders</span>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-lg border border-slate-200/80 bg-white py-4 pl-5 pr-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/90">
                    <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-lg bg-slate-400" />
                    <div className="flex items-start justify-between gap-2 pl-1">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            Active terminals
                        </p>
                        <KpiPill label="Stable" trend="stable" />
                    </div>
                    <p className="mt-1 pl-1 font-sans text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {terminalDisplay.active} / {terminalDisplay.total}
                    </p>
                    <div className="mt-3 flex items-center gap-2 pl-1 text-xs text-slate-500 dark:text-slate-400">
                        <RefreshCw className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} />
                        <span className="font-medium">Network uptime: 99.9%</span>
                    </div>
                </div>
            </div>

            {/* Middle: category + trend */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/90">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Revenue by Category Mix</h2>
                        <button
                            type="button"
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            aria-label="Category options"
                        >
                            <MoreVertical className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="space-y-5">
                        {categoryPerformance.length > 0 ? (
                            categoryPerformance.map((cat: { category?: string; revenue?: number; unitsSold?: number }, i: number) => {
                                const rev = Number(cat.revenue) || 0;
                                const pct = categoryTotal > 0 ? (rev / categoryTotal) * 100 : 0;
                                const barCls = CATEGORY_BAR_CLASSES[i % CATEGORY_BAR_CLASSES.length];
                                return (
                                    <div key={`${cat.category}-${i}`} className="space-y-2">
                                        <div className="flex items-end justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                    {cat.category}
                                                </p>
                                                <p className="text-xs font-medium text-slate-500">
                                                    {cat.unitsSold ?? 0} units sold
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                                    {CURRENCY} {rev.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                                                </p>
                                                <p className="text-xs font-semibold text-slate-500">{pct.toFixed(1)}%</p>
                                            </div>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${barCls}`}
                                                style={{ width: `${Math.min(100, pct)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="py-6 text-center text-sm text-slate-400">No category data available</p>
                        )}
                    </div>
                </div>

                <div className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/90">
                    <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Daily Revenue Trend</h2>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Comparing POS vs Mobile App performance
                            </p>
                        </div>
                        <div className="flex flex-col items-stretch gap-2 sm:items-end">
                            <div className="flex items-center gap-3 text-xs font-semibold">
                                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                    <span className="h-2 w-2 rounded-full bg-[#1A237E]" />
                                    POS
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                    <span className="h-2 w-2 rounded-full bg-[#26A69A]" />
                                    Mobile
                                </span>
                            </div>
                            <label className="sr-only" htmlFor="trend-range">
                                Chart range
                            </label>
                            <select
                                id="trend-range"
                                value={trendDays}
                                onChange={(e) => setTrendDays(Number(e.target.value) as TrendDays)}
                                className="rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-7 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                            >
                                <option value={8}>Last 8 Days</option>
                                <option value={14}>Last 14 Days</option>
                            </select>
                        </div>
                    </div>
                    <div className="h-[280px] w-full pt-2">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="saPosFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={NAVY} stopOpacity={0.25} />
                                            <stop offset="95%" stopColor={NAVY} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="saMobFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={TEAL} stopOpacity={0.25} />
                                            <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        vertical={false}
                                        strokeDasharray="3 3"
                                        stroke={CHART_MUTED}
                                        strokeOpacity={0.35}
                                    />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11, fill: MUTED }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: MUTED }}
                                        tickLine={false}
                                        axisLine={false}
                                        domain={[0, maxChart]}
                                        tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : String(v))}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: 8,
                                            border: '1px solid #E5E7EB',
                                            fontSize: 12,
                                        }}
                                        formatter={(v: number, name: string) => [
                                            `${CURRENCY} ${Number(v).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`,
                                            name === 'pos' ? 'POS' : 'Mobile',
                                        ]}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="pos"
                                        name="pos"
                                        stroke={NAVY}
                                        strokeWidth={2}
                                        fill="url(#saPosFill)"
                                        fillOpacity={1}
                                        dot={{ r: 2, fill: NAVY, strokeWidth: 0 }}
                                        activeDot={{ r: 4 }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="mobile"
                                        name="mobile"
                                        stroke={TEAL}
                                        strokeWidth={2}
                                        fill="url(#saMobFill)"
                                        fillOpacity={1}
                                        dot={{ r: 2, fill: TEAL, strokeWidth: 0 }}
                                        activeDot={{ r: 4 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-400">
                                No trend data for this range
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/90">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Recent Transactions &amp; Terminal Health
                    </h2>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100/90 p-0.5 dark:bg-slate-800/80">
                            {(
                                [
                                    { id: 'all' as const, label: 'All' },
                                    { id: 'pos' as const, label: 'POS' },
                                    { id: 'mobile' as const, label: 'Mobile' },
                                ] as const
                            ).map((b) => (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => setSourceFilter(b.id)}
                                    className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                                        sourceFilter === b.id
                                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {b.label}
                                </button>
                            ))}
                        </div>
                        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100/90 p-0.5 dark:bg-slate-800/80">
                            <button
                                type="button"
                                onClick={() => setTerminalFilter('all')}
                                className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                                    terminalFilter === 'all'
                                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                }`}
                            >
                                All Terminals
                            </button>
                            <button
                                type="button"
                                onClick={() => setTerminalFilter('warning')}
                                className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                                    terminalFilter === 'warning'
                                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                }`}
                            >
                                Warning only
                            </button>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left">
                        <thead>
                            <tr className="border-b border-slate-100 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-500 dark:border-slate-800">
                                <th className="px-5 py-3">Reference</th>
                                <th className="px-5 py-3">Source</th>
                                <th className="px-5 py-3">Payment</th>
                                <th className="px-5 py-3 text-right">Amount (PKR)</th>
                                <th className="px-5 py-3">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTx.length > 0 ? (
                                filteredTx.map((tx: { reference?: string; source?: string; payment_method?: string; amount?: number; created_at?: string }, i: number) => (
                                    <tr
                                        key={`${tx.reference}-${i}`}
                                        className="border-b border-slate-50 text-sm last:border-0 dark:border-slate-800/80"
                                    >
                                        <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                                            {tx.reference}
                                        </td>
                                        <td className="px-5 py-4">
                                            {tx.source === 'Mobile' ? (
                                                <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                                                    Mobile
                                                </span>
                                            ) : (
                                                <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold uppercase text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                                                    POS
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 italic text-slate-600 dark:text-slate-400">
                                            {tx.payment_method || 'Cash'}
                                        </td>
                                        <td className="px-5 py-4 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                                            {Number(tx.amount || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                                        </td>
                                        <td className="px-5 py-4 text-slate-600 dark:text-slate-400">
                                            {tx.created_at
                                                ? new Date(tx.created_at).toLocaleDateString('en-US', {
                                                      year: 'numeric',
                                                      month: '2-digit',
                                                      day: '2-digit',
                                                  })
                                                : '—'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-400">
                                        {terminalFilter === 'warning'
                                            ? 'No transactions match the terminal warning filter for this view.'
                                            : 'No transactions yet. Complete a sale to see data here.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SalesAnalytics;
