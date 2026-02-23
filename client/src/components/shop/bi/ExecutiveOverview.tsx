
import React from 'react';
import { useBI } from '../../../context/BIContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';

const ExecutiveOverview: React.FC = () => {
    const { kpis, storeRankings, salesTrend } = useBI();

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* KPI Executive Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {kpis.map((kpi, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm flex flex-col gap-4 relative overflow-hidden group hover:shadow-xl transition-all bg-white">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{kpi.label}</p>
                                <p className="text-3xl font-black text-slate-800 tracking-tighter mt-1">{kpi.value}</p>
                            </div>
                            <div className={`flex items-center gap-1 text-[10px] font-black p-1.5 rounded-lg ${kpi.status === 'up' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
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
                <Card className="lg:col-span-2 border-none shadow-sm p-8 bg-white space-y-8">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 text-lg">Intraday Sales Velocity</h3>
                        <div className="flex gap-4">
                            <span className="flex items-center gap-2 text-[10px] font-bold text-indigo-600">
                                <span className="w-2 h-2 bg-indigo-600 rounded-full"></span> Revenue
                            </span>
                            <span className="flex items-center gap-2 text-[10px] font-bold text-slate-300">
                                <span className="w-2 h-2 bg-slate-200 rounded-full"></span> Target
                            </span>
                        </div>
                    </div>

                    <div className="h-64 flex items-end gap-2 group/chart border-b border-slate-100 relative">
                        {salesTrend.map((data, idx) => {
                            const maxRevenue = Math.max(...salesTrend.map((d: any) => d.revenue || 0), 1);
                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-2 relative group cursor-pointer h-full justify-end">
                                    <div
                                        className="w-full bg-slate-50 border border-slate-100 rounded-t-lg transition-all duration-700 min-h-[4px] relative overflow-hidden"
                                        style={{ height: `${(data.revenue / maxRevenue) * 100}%` }}
                                    >
                                        <div className="absolute inset-0 bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    </div>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{data.timestamp}</span>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Top Branches Card */}
                <Card className="border-none shadow-sm p-8 space-y-6 flex flex-col">
                    <h3 className="font-bold text-slate-800 text-lg">Top Performing Nodes</h3>
                    <div className="space-y-6 flex-1">
                        {storeRankings.map((store, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-100">
                                        0{i + 1}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-800 leading-none">{store.storeName}</p>
                                        <p className="text-[10px] text-emerald-500 font-bold mt-1">+{store.growth}% Growth</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-slate-800 font-mono tracking-tighter">
                                        {CURRENCY} {(store.revenue / 1000000).toFixed(1)}M
                                    </p>
                                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Rev</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border border-dashed border-slate-200 hover:bg-slate-100 transition-all">
                        Full Performance Audit
                    </button>
                </Card>
            </div>

            {/* AI Insights - populated when enough data is available */}
            {salesTrend.some((d: any) => d.revenue > 0) ? null : (
                <div className="p-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
                    <p className="text-xs font-bold text-slate-400">Insights will appear here once enough sales data is collected.</p>
                </div>
            )}
        </div>
    );
};

export default ExecutiveOverview;
