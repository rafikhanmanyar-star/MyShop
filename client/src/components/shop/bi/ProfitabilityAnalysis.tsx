
import React from 'react';
import { useBI } from '../../../context/BIContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';

const ProfitabilityAnalysis: React.FC = () => {
    const { categoryPerformance, salesBySource } = useBI();

    const totalRevenue = (salesBySource?.pos?.totalRevenue || 0) + (salesBySource?.mobile?.totalRevenue || 0);
    const hasData = totalRevenue > 0;

    const topCategories = [...(categoryPerformance || [])]
        .filter((c: any) => Number(c.revenue) > 0)
        .sort((a: any, b: any) => Number(b.revenue) - Number(a.revenue))
        .slice(0, 5);

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom duration-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    {ICONS.dollarSign} Margin & Yield Optimization
                </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Revenue Breakdown */}
                <Card className="border-none shadow-sm p-8 bg-white space-y-8">
                    <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px]">Revenue Breakdown</h4>
                    {hasData ? (
                        <div className="space-y-6 pt-4">
                            {[
                                { label: 'Total Revenue', val: `${CURRENCY} ${totalRevenue.toLocaleString()}`, percent: 100, color: 'bg-indigo-600' },
                                { label: 'POS Revenue', val: `${CURRENCY} ${(salesBySource?.pos?.totalRevenue || 0).toLocaleString()}`, percent: totalRevenue > 0 ? ((salesBySource?.pos?.totalRevenue || 0) / totalRevenue) * 100 : 0, color: 'bg-emerald-500' },
                                { label: 'Mobile Revenue', val: `${CURRENCY} ${(salesBySource?.mobile?.totalRevenue || 0).toLocaleString()}`, percent: totalRevenue > 0 ? ((salesBySource?.mobile?.totalRevenue || 0) / totalRevenue) * 100 : 0, color: 'bg-amber-400' },
                            ].map((step, i) => (
                                <div key={i} className="flex items-center gap-6">
                                    <div className="w-32 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{step.label}</div>
                                    <div className="flex-1 h-8 bg-slate-50 rounded-lg relative overflow-hidden">
                                        <div
                                            className={`h-full ${step.color} transition-all duration-1000 shadow-sm`}
                                            style={{ width: `${step.percent}%` }}
                                        ></div>
                                    </div>
                                    <div className="w-24 text-sm font-black text-slate-800 font-mono text-right">{step.val}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center py-16">
                            <p className="text-xs text-slate-400">No revenue data available yet. Complete sales to see the breakdown.</p>
                        </div>
                    )}
                </Card>

                {/* Top Categories by Revenue */}
                <Card className="border-none shadow-sm p-8 bg-white flex flex-col h-full">
                    <h4 className="font-bold text-slate-800 uppercase tracking-widest text-[10px] mb-8">Top Categories by Revenue</h4>
                    <div className="space-y-6 flex-1">
                        {topCategories.length > 0 ? topCategories.map((cat: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-4 border border-slate-50 rounded-2xl hover:border-indigo-100 transition-all cursor-pointer group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 font-black text-xl group-hover:text-indigo-600 transition-colors">
                                        {cat.category.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 tracking-tight">{cat.category}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{Number(cat.unitsSold).toLocaleString()} units sold</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-emerald-600 font-mono leading-none">{CURRENCY} {Number(cat.revenue).toLocaleString()}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="flex items-center justify-center py-16">
                                <p className="text-xs text-slate-400">No category data available yet.</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default ProfitabilityAnalysis;
