
import React from 'react';
import { useBI } from '../../../context/BIContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';

const SalesAnalytics: React.FC = () => {
    const { categoryPerformance, salesTrend, salesBySource, recentTransactions, loading } = useBI();

    const posRevenue = salesBySource?.pos?.totalRevenue || 0;
    const mobileRevenue = salesBySource?.mobile?.totalRevenue || 0;
    const posOrders = salesBySource?.pos?.totalOrders || 0;
    const mobileOrders = salesBySource?.mobile?.totalOrders || 0;

    return (
        <div className="space-y-8 animate-in slide-in-from-right duration-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    {ICONS.trendingUp} Volume & Mix Analysis
                </h3>
            </div>

            {/* POS vs Mobile Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-none shadow-sm p-6 bg-white space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            {ICONS.grid}
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">POS Sales</p>
                            <p className="text-2xl font-black text-slate-800 font-mono">{CURRENCY} {posRevenue.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">{posOrders} transactions</span>
                        <span className="font-bold text-indigo-600">
                            Avg: {CURRENCY} {(salesBySource?.pos?.avgOrderValue || 0).toFixed(0)}
                        </span>
                    </div>
                </Card>

                <Card className="border-none shadow-sm p-6 bg-white space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            {ICONS.globe}
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mobile App Orders</p>
                            <p className="text-2xl font-black text-slate-800 font-mono">{CURRENCY} {mobileRevenue.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">{mobileOrders} orders</span>
                        <span className="font-bold text-emerald-600">
                            Avg: {CURRENCY} {(salesBySource?.mobile?.avgOrderValue || 0).toFixed(0)}
                        </span>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Category Mix */}
                <Card className="border-none shadow-sm p-8 bg-white flex flex-col gap-8">
                    <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px]">Revenue by Category Mix</h4>
                    <div className="space-y-8 flex-1">
                        {categoryPerformance.length > 0 ? categoryPerformance.map((cat: any, i: number) => {
                            const total = categoryPerformance.reduce((sum: number, c: any) => sum + (Number(c.revenue) || 0), 0);
                            const percent = total > 0 ? ((Number(cat.revenue) || 0) / total) * 100 : 0;
                            return (
                                <div key={i} className="space-y-3 cursor-pointer group">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-sm font-black text-slate-800 group-hover:text-indigo-600 transition-colors">{cat.category}</p>
                                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{cat.unitsSold} units sold</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-800 font-mono tracking-tight">
                                                {CURRENCY} {Number(cat.revenue).toLocaleString()}
                                            </p>
                                            <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase">{percent.toFixed(1)}% Share</p>
                                        </div>
                                    </div>
                                    <div className="h-3 bg-slate-50 rounded-full overflow-hidden flex">
                                        <div
                                            className={`h-full transition-all duration-1000 ${i === 0 ? 'bg-indigo-600' : i === 1 ? 'bg-emerald-500' : i === 2 ? 'bg-amber-400' : 'bg-slate-300'}`}
                                            style={{ width: `${percent}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="text-center py-8 text-slate-300 text-xs">No category data available</div>
                        )}
                    </div>
                </Card>

                {/* Daily Revenue Bars */}
                <Card className="border-none shadow-sm p-8 bg-white space-y-8">
                    <div className="flex justify-between items-center">
                        <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px]">Daily Revenue Trend</h4>
                        <div className="flex gap-3">
                            <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-600">
                                <span className="w-2 h-2 bg-indigo-600 rounded-full"></span> POS
                            </span>
                            <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Mobile
                            </span>
                        </div>
                    </div>
                    <div className="h-48 flex items-end gap-1 group/chart border-b border-slate-100">
                        {salesTrend.slice(-14).map((data: any, idx: number) => {
                            const maxRev = Math.max(...salesTrend.slice(-14).map((d: any) => d.revenue || 1));
                            const totalH = maxRev > 0 ? ((data.revenue || 0) / maxRev) * 100 : 0;
                            const posH = maxRev > 0 ? ((data.posRevenue || 0) / maxRev) * 100 : 0;
                            const mobileH = maxRev > 0 ? ((data.mobileRevenue || 0) / maxRev) * 100 : 0;
                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-0 relative group cursor-pointer h-full justify-end">
                                    {/* Stacked bar */}
                                    <div className="w-full flex flex-col justify-end" style={{ height: `${totalH}%`, minHeight: '2px' }}>
                                        {mobileH > 0 && (
                                            <div className="w-full bg-emerald-500 rounded-t-sm" style={{ height: `${(mobileH / Math.max(totalH, 1)) * 100}%`, minHeight: '2px' }}></div>
                                        )}
                                        {posH > 0 && (
                                            <div className="w-full bg-indigo-600 rounded-t-sm" style={{ height: `${(posH / Math.max(totalH, 1)) * 100}%`, minHeight: '2px' }}></div>
                                        )}
                                    </div>
                                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter mt-1 whitespace-nowrap">{data.timestamp}</span>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>

            {/* Recent Transactions */}
            <Card className="border-none shadow-sm overflow-hidden bg-white">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 text-sm">Recent Transactions (All Sources)</h4>
                    <div className="flex gap-2">
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-600 text-[9px] font-black rounded uppercase">POS</span>
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-[9px] font-black rounded uppercase">Mobile</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Reference</th>
                                <th className="px-6 py-4">Source</th>
                                <th className="px-6 py-4">Payment</th>
                                <th className="px-6 py-4 text-right">Amount ({CURRENCY})</th>
                                <th className="px-6 py-4">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-xs">
                            {recentTransactions.length > 0 ? recentTransactions.slice(0, 10).map((tx: any, i: number) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors font-medium">
                                    <td className="px-6 py-4 font-mono font-bold text-slate-500">{tx.reference}</td>
                                    <td className="px-6 py-4">
                                        {tx.source === 'Mobile' ? (
                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[9px] font-black uppercase">Mobile</span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-black uppercase">POS</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 italic text-slate-400">{tx.payment_method || 'Cash'}</td>
                                    <td className="px-6 py-4 text-right font-black text-slate-900">{Number(tx.amount || 0).toLocaleString()}</td>
                                    <td className="px-6 py-4 text-slate-400">{new Date(tx.created_at).toLocaleDateString()}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-300 italic">
                                        No transactions yet. Complete a sale to see data here.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default SalesAnalytics;
