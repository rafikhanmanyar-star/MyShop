
import React, { useMemo } from 'react';
import { useBI } from '../../../context/BIContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import InventoryAuditWizard from './InventoryAuditWizard';

const InventoryIntelligence: React.FC = () => {
    const { categoryPerformance } = useBI();

    const [isAuditWizardOpen, setIsAuditWizardOpen] = React.useState(false);

    const totalUnits = useMemo(() => categoryPerformance.reduce((sum: number, c: any) => sum + (Number(c.unitsSold) || 0), 0), [categoryPerformance]);
    const totalCategories = categoryPerformance.length;
    const hasData = categoryPerformance.length > 0 && totalUnits > 0;

    const topCategory = useMemo(() => {
        if (!hasData) return null;
        return [...categoryPerformance].sort((a: any, b: any) => (Number(b.unitsSold) || 0) - (Number(a.unitsSold) || 0))[0];
    }, [categoryPerformance, hasData]);

    const slowCategory = useMemo(() => {
        if (!hasData || categoryPerformance.length < 2) return null;
        return [...categoryPerformance].sort((a: any, b: any) => (Number(a.unitsSold) || 0) - (Number(b.unitsSold) || 0))[0];
    }, [categoryPerformance, hasData]);

    const stats = [
        { label: 'Categories Tracked', value: totalCategories > 0 ? `${totalCategories}` : '--', icon: ICONS.dollarSign, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/50' },
        { label: 'Total Units Sold', value: totalUnits > 0 ? totalUnits.toLocaleString() : '--', icon: ICONS.history, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
        { label: 'Top Category', value: topCategory ? topCategory.category : '--', icon: ICONS.barChart, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50' },
    ];

    return (
        <div className="space-y-8 animate-in zoom-in duration-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-black text-foreground dark:text-slate-200 tracking-tight flex items-center gap-2">
                    {ICONS.package} Supply Chain & Inventory IQ
                </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((stat, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 flex items-center gap-4 bg-card">
                        <div className={`w-12 h-12 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                            {React.cloneElement(stat.icon as React.ReactElement<any>, { width: 24, height: 24 })}
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                            <p className="text-xl font-black text-foreground tracking-tight">{stat.value}</p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Category Distribution */}
                <Card className="lg:col-span-2 border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 p-8 bg-card space-y-8">
                    <h4 className="font-bold text-foreground dark:text-slate-200 uppercase tracking-widest text-[10px]">Category Distribution</h4>
                    {hasData ? (
                        <div className="flex gap-4 h-64 items-end justify-between px-4">
                            {categoryPerformance.slice(0, 6).map((cat: any, i: number) => {
                                const maxUnits = Math.max(...categoryPerformance.map((c: any) => Number(c.unitsSold) || 0), 1);
                                const percent = ((Number(cat.unitsSold) || 0) / maxUnits) * 100;
                                const colors = ['bg-emerald-500', 'bg-indigo-500', 'bg-amber-500', 'bg-rose-500', 'bg-purple-500', 'bg-sky-500'];
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-4">
                                        <div className="text-xs font-black text-foreground">{Number(cat.unitsSold) || 0}</div>
                                        <div
                                            className={`w-full ${colors[i % colors.length]} rounded-t-xl transition-all duration-1000 shadow-lg`}
                                            style={{ height: `${Math.max(percent * 2, 4)}px` }}
                                        ></div>
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center leading-tight">{cat.category}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center">
                            <p className="text-xs text-muted-foreground">No inventory data available yet. Complete sales to see distribution.</p>
                        </div>
                    )}
                </Card>

                {/* Movement IQ */}
                <Card className="border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 p-8 bg-card space-y-6">
                    <h4 className="font-bold text-foreground dark:text-slate-200 uppercase tracking-widest text-[10px]">Movement IQ</h4>
                    {hasData ? (
                        <div className="space-y-6">
                            {topCategory && (
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-100 dark:border-emerald-900/60 relative overflow-hidden group">
                                    <div className="absolute right-0 top-0 opacity-10 p-2 transform rotate-12 group-hover:scale-125 transition-transform">
                                        {ICONS.trendingUp}
                                    </div>
                                    <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Top Seller</p>
                                    <p className="text-sm font-black text-emerald-900 dark:text-emerald-200 mt-1">{topCategory.category}</p>
                                    <p className="text-[10px] text-emerald-700 dark:text-emerald-300/90 mt-1">{Number(topCategory.unitsSold).toLocaleString()} units sold</p>
                                </div>
                            )}
                            {slowCategory && slowCategory.category !== topCategory?.category && (
                                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-100 dark:border-rose-900/60 relative overflow-hidden group">
                                    <div className="absolute right-0 top-0 opacity-10 p-2 transform -rotate-12 group-hover:scale-125 transition-transform">
                                        {ICONS.trendingDown}
                                    </div>
                                    <p className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">Slowest Category</p>
                                    <p className="text-sm font-black text-rose-900 dark:text-rose-200 mt-1">{slowCategory.category}</p>
                                    <p className="text-[10px] text-rose-700 dark:text-rose-300/90 mt-1">{Number(slowCategory.unitsSold).toLocaleString()} units sold</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center py-8">
                            <p className="text-xs text-muted-foreground text-center">Complete sales to see movement data.</p>
                        </div>
                    )}
                    <button
                        onClick={() => setIsAuditWizardOpen(true)}
                        className="w-full py-4 bg-slate-900 dark:bg-slate-950 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black dark:hover:bg-slate-800 transition-all border border-transparent dark:border-slate-700"
                    >
                        Inventory Audit Wizard
                    </button>
                </Card>
            </div>

            <InventoryAuditWizard
                isOpen={isAuditWizardOpen}
                onClose={() => setIsAuditWizardOpen(false)}
            />
        </div>
    );

};

export default InventoryIntelligence;
