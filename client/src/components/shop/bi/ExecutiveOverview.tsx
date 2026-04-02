
import React from 'react';
import { useBI } from '../../../context/BIContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';

const ExecutiveOverview: React.FC = () => {
    const { kpis, storeRankings, salesTrend } = useBI();

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* KPI Executive Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                {kpis.map((kpi, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 flex flex-col gap-4 relative overflow-hidden group hover:shadow-xl transition-all bg-card">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{kpi.label}</p>
                                <p className="text-3xl font-semibold text-foreground dark:text-slate-100 tracking-tighter mt-1">{kpi.value}</p>
                            </div>
                            <div className={`flex items-center gap-1 text-xs font-semibold p-1.5 rounded-lg ${kpi.status === 'up' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                                }`}>
                                {kpi.status === 'up' ? ICONS.trendingUp : ICONS.trendingDown}
                                {Math.abs(kpi.trend)}%
                            </div>
                        </div>

                        <div className="h-12 flex items-end gap-1 px-1">
                            {kpi.sparkline.map((val, idx) => (
                                <div
                                    key={idx}
                                    className={`flex-1 rounded-sm transition-all duration-1000 ${kpi.status === 'up' ? 'bg-emerald-500/20 group-hover:bg-emerald-500' : 'bg-rose-500/20 group-hover:bg-rose-500'
                                        }`}
                                    style={{ height: `${(val / Math.max(...kpi.sparkline)) * 100}%` }}
                                ></div>
                            ))}
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Sales Velocity Chart */}
                <Card className="lg:col-span-2 border-none shadow-sm p-8 bg-card space-y-8">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-foreground text-lg">Intraday Sales Velocity</h3>
                        <div className="flex gap-4">
                            <span className="flex items-center gap-2 text-xs font-bold text-indigo-600">
                                <span className="w-2 h-2 bg-indigo-600 rounded-full"></span> Revenue
                            </span>
                            <span className="flex items-center gap-2 text-xs font-bold text-slate-300">
                                <span className="w-2 h-2 bg-slate-200 rounded-full"></span> Target
                            </span>
                        </div>
                    </div>

                    <div className="h-64 flex items-end gap-2 group/chart border-b border-border relative">
                        {salesTrend.map((data, idx) => {
                            const maxRevenue = Math.max(...salesTrend.map((d: any) => d.revenue || 0), 1);
                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-2 relative group cursor-pointer h-full justify-end">
                                    <div
                                        className="w-full bg-muted/80 dark:bg-slate-800 border border-border dark:border-slate-600 rounded-t-lg transition-all duration-700 min-h-[4px] relative overflow-hidden"
                                        style={{ height: `${(data.revenue / maxRevenue) * 100}%` }}
                                    >
                                        <div className="absolute inset-0 bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    </div>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-tighter">{data.timestamp}</span>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Top Branches Card */}
                <Card className="border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 p-8 space-y-6 flex flex-col">
                    <h3 className="font-bold text-foreground dark:text-slate-200 text-lg">Top Performing Nodes</h3>
                    <div className="space-y-6 flex-1">
                        {storeRankings.map((store, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-muted/80 dark:bg-slate-800 flex items-center justify-center text-xs font-semibold text-muted-foreground border border-border dark:border-slate-600">
                                        0{i + 1}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-foreground leading-none">{store.storeName}</p>
                                        <p className="text-xs text-emerald-500 dark:text-emerald-400 font-bold mt-1">+{store.growth}% Growth</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-foreground font-mono tracking-tighter">
                                        {CURRENCY} {(store.revenue / 1000000).toFixed(1)}M
                                    </p>
                                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-widest">Rev</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full py-4 bg-muted/80 dark:bg-slate-800/80 text-muted-foreground rounded-2xl font-semibold text-xs uppercase tracking-[0.2em] border border-dashed border-border dark:border-slate-600 hover:bg-muted dark:hover:bg-slate-700/80 transition-all">
                        Full Performance Audit
                    </button>
                </Card>
            </div>

            {/* AI Insights - populated when enough data is available */}
            {salesTrend.some((d: any) => d.revenue > 0) ? null : (
                <div className="p-6 rounded-2xl border border-dashed border-border dark:border-slate-600 bg-muted/80 dark:bg-slate-900/60 text-center">
                    <p className="text-xs font-bold text-muted-foreground">Insights will appear here once enough sales data is collected.</p>
                </div>
            )}
        </div>
    );
};

export default ExecutiveOverview;
