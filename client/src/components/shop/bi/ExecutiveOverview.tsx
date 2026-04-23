
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Rocket } from 'lucide-react';
import { useBI } from '../../../context/BIContext';
import { CURRENCY } from '../../../constants';
import Card from '../../ui/Card';

const KPI_ACCENTS = [
    'border-l-[#0047AB]',
    'border-l-[#DC2626]',
    'border-l-[#06B6D4]',
    'border-l-[#7C3AED]',
    'border-l-[#EA580C]',
];

const BAR_SHADES = [
    'bg-[#1e4a8c]',
    'bg-[#2563b8]',
    'bg-[#3b7dd6]',
    'bg-[#5b9ae8]',
    'bg-[#7eb8ff]',
    'bg-[#2563b8]',
    'bg-[#1e4a8c]',
    'bg-[#0047AB]',
];

const STOCK_OUT_ITEMS = [
    { name: 'Premium Leather Jacket', days: 2, urgency: 'critical' as const },
    { name: 'Ceramic Cookware Set', days: 5, urgency: 'warn' as const },
];

const ExecutiveOverview: React.FC = () => {
    const { kpis, storeRankings, salesTrend } = useBI();
    const navigate = useNavigate();
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const chartRangeLabel = useMemo(() => {
        if (!salesTrend.length) return '';
        const first = salesTrend[0]?.timestamp;
        const last = salesTrend[salesTrend.length - 1]?.timestamp;
        if (!first || !last) return '';
        return `${first.toUpperCase()} — ${last.toUpperCase()}`;
    }, [salesTrend]);

    const displayTrend = (kpi: { trend: number; status: string }) => {
        const isUp = kpi.status === 'up';
        const pct = kpi.trend;
        const arrow = isUp ? '↗' : '↘';
        const signed = isUp ? `${pct}%` : `-${pct}%`;
        return (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {arrow} {signed}
            </span>
        );
    };

    return (
        <div className="animate-in fade-in space-y-6 duration-500 sm:space-y-8">
            <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-5">
                {kpis.map((kpi, i) => {
                    const accent = KPI_ACCENTS[i] ?? KPI_ACCENTS[0];
                    return (
                        <Card
                            key={i}
                            className={`relative overflow-hidden border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900/95 ${accent} border-l-4`}
                        >
                            <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                {kpi.label}
                            </p>
                            <div className="mt-2 flex items-start justify-between gap-2">
                                <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                                    {kpi.value}
                                </p>
                                {displayTrend(kpi)}
                            </div>
                            {kpi.subtext && (
                                <p className="mt-3 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                    {kpi.subtext}
                                </p>
                            )}
                        </Card>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
                <Card className="space-y-6 border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-slate-900/95 lg:col-span-2">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                Intraday Sales Velocity
                            </h3>
                            {chartRangeLabel && (
                                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                                    {chartRangeLabel}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-5">
                            <span className="flex items-center gap-2 text-xs font-bold text-[#0B2A5B] dark:text-[#7eb8ff]">
                                <span className="h-2 w-2 rounded-full bg-[#0047AB]" />
                                Revenue
                            </span>
                            <span className="flex items-center gap-2 text-xs font-bold text-slate-400">
                                <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-500" />
                                Target
                            </span>
                        </div>
                    </div>

                    <div className="relative flex h-64 items-end gap-1.5 border-b border-slate-200 pb-1 sm:gap-2 dark:border-slate-600">
                        {salesTrend.map((data, idx) => {
                            const maxRevenue = Math.max(...salesTrend.map((d: { revenue?: number }) => d.revenue || 0), 1);
                            const h = `${Math.max(6, (data.revenue / maxRevenue) * 100)}%`;
                            const shade = BAR_SHADES[idx % BAR_SHADES.length];
                            const showTip = hoverIdx === idx && (data.revenue || 0) > 0;
                            return (
                                <div
                                    key={idx}
                                    className="group flex h-full flex-1 flex-col items-center justify-end"
                                    onMouseEnter={() => setHoverIdx(idx)}
                                    onMouseLeave={() => setHoverIdx(null)}
                                >
                                    {showTip && (
                                        <div className="mb-2 rounded-md bg-slate-900 px-2 py-1 text-[0.65rem] font-semibold text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
                                            {CURRENCY}{' '}
                                            {((data.revenue || 0) / 1000).toFixed(1)}K
                                        </div>
                                    )}
                                    <div
                                        className={`w-full max-w-[3rem] rounded-t-md transition-all ${shade} opacity-90 hover:opacity-100`}
                                        style={{ height: h }}
                                    />
                                    <span className="mt-2 text-[0.65rem] font-semibold uppercase tracking-tight text-slate-500 dark:text-slate-400">
                                        {data.timestamp}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                <Card className="flex flex-col space-y-5 border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-slate-900/95">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            Top Performing Nodes
                        </h3>
                        <button
                            type="button"
                            onClick={() => navigate('/analytics?tab=sales')}
                            className="text-xs font-bold text-[#0047AB] hover:underline dark:text-[#5b8cff]"
                        >
                            View All
                        </button>
                    </div>
                    <div className="flex flex-1 flex-col gap-3">
                        {storeRankings.slice(0, 3).map((store, i) => (
                            <div
                                key={`${store.storeName}-${i}`}
                                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-600 dark:bg-slate-800/50"
                            >
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#0047AB] text-xs font-bold text-white dark:bg-[#0047AB]">
                                    {String(i + 1).padStart(2, '0')}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                        {store.storeName}
                                    </p>
                                    <p className="mt-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                        +{store.growth}% Growth
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                                        {CURRENCY} {(store.revenue / 1_000_000).toFixed(1)}M
                                    </p>
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">
                                        Rev
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/multi-store')}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B2A5B] py-3.5 text-xs font-bold uppercase tracking-[0.12em] text-white shadow-sm transition-colors hover:bg-[#071d40] dark:bg-[#0B2A5B] dark:hover:bg-[#071d40]"
                    >
                        <BarChart3 className="h-4 w-4" strokeWidth={2} aria-hidden />
                        Full Performance Audit
                    </button>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
                <Card className="border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-slate-900/95">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            Predictive Stock Out Risk
                        </h3>
                        <span className="rounded bg-red-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-400">
                            Critical
                        </span>
                    </div>
                    <ul className="space-y-5">
                        {STOCK_OUT_ITEMS.map((item) => (
                            <li key={item.name}>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.name}</p>
                                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div
                                        className={`h-full rounded-full ${
                                            item.urgency === 'critical'
                                                ? 'bg-[#7f1d1d] dark:bg-red-900'
                                                : 'bg-orange-500 dark:bg-orange-600'
                                        }`}
                                        style={{
                                            width: item.urgency === 'critical' ? '92%' : '58%',
                                        }}
                                    />
                                </div>
                                <p className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {item.days} Days Remaining
                                </p>
                            </li>
                        ))}
                    </ul>
                </Card>

                <div className="flex flex-col justify-between rounded-xl border border-[#0B2A5B]/30 bg-[#0B2A5B] p-6 text-white shadow-md dark:border-slate-700">
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">System Uptime</h3>
                        <p className="mt-3 text-4xl font-bold tracking-tight">99.98%</p>
                    </div>
                    <div className="mt-6 flex h-10 items-end gap-1">
                        {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95].map((h, i) => (
                            <div
                                key={i}
                                className="flex-1 rounded-t-sm bg-white/25"
                                style={{ height: `${h}%` }}
                            />
                        ))}
                    </div>
                </div>

                <Card className="flex flex-col items-center justify-center border border-slate-200/80 bg-white p-8 text-center shadow-sm dark:border-slate-600 dark:bg-slate-900/95">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-950/50">
                        <Rocket className="h-8 w-8 text-sky-600 dark:text-sky-400" strokeWidth={1.75} aria-hidden />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">New Features</h3>
                    <p className="mt-2 max-w-xs text-sm text-slate-600 dark:text-slate-400">
                        Predictive procurement AI is now live in beta.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/analytics?tab=procurement')}
                        className="mt-5 text-sm font-bold text-[#0047AB] hover:underline dark:text-[#5b8cff]"
                    >
                        Read Release Notes
                    </button>
                </Card>
            </div>

            {salesTrend.some((d: { revenue?: number }) => (d.revenue || 0) > 0) ? null : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-center dark:border-slate-600 dark:bg-slate-900/60">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        Insights will appear here once enough sales data is collected.
                    </p>
                </div>
            )}
        </div>
    );
};

export default ExecutiveOverview;
