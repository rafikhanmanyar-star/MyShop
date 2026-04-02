
import React, { useMemo } from 'react';
import { useMultiStore } from '../../../context/MultiStoreContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';

const OrganizationDashboard: React.FC = () => {
    const { organization, consolidatedRevenue, activeTerminalsCount, stores, performance } = useMultiStore();

    const activeBranches = stores.filter(s => s.status === 'Active').length;

    const stats = [
        { label: 'Network Revenue', value: `${CURRENCY} ${consolidatedRevenue.toLocaleString()}`, icon: ICONS.trendingUp, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/50' },
        { label: 'Active Branches', value: activeBranches, icon: ICONS.building, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
        { label: 'POS Terminals', value: activeTerminalsCount, icon: ICONS.history, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50' },
        { label: 'Total Stores', value: stores.length, icon: ICONS.heart, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/50' },
    ];

    // Top branches by performance
    const sortedBranches = [...performance].sort((a, b) => b.salesToday - a.salesToday);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className={`w-14 h-14 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                            {React.cloneElement(stat.icon as React.ReactElement<any>, { width: 28, height: 28 })}
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                            <p className="text-2xl font-semibold text-foreground tracking-tight">{stat.value}</p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Network Performance Leaderboard */}
                <Card className="lg:col-span-2 border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 p-8 space-y-6 bg-card">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-foreground dark:text-slate-200 text-lg">Branch Performance Ranking</h3>
                            <p className="text-xs text-muted-foreground font-medium">Real-time throughput comparison across the network.</p>
                        </div>
                        <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Full Benchmark Report</button>
                    </div>

                    <div className="space-y-8 pt-4">
                        {sortedBranches.map((perf, i) => {
                            const store = stores.find(s => s.id === perf.storeId);
                            const percent = (perf.salesToday / sortedBranches[0].salesToday) * 100;
                            return (
                                <div key={perf.storeId} className="space-y-2">
                                    <div className="flex justify-between items-end">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-semibold text-slate-300 dark:text-slate-600">#0{i + 1}</span>
                                            <div>
                                                <p className="text-sm font-bold text-foreground">{store?.name}</p>
                                                <p className="text-xs text-muted-foreground uppercase font-mono">{store?.code}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-foreground font-mono">{CURRENCY} {perf.salesToday.toLocaleString()}</p>
                                            <p className={`text-xs font-bold ${perf.variance >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                                {perf.variance >= 0 ? '+' : ''}{perf.variance}% vs Yesterday
                                            </p>
                                        </div>
                                    </div>
                                    <div className="h-2 bg-muted/80 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-1000"
                                            style={{ width: `${percent}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Regional Distribution */}
                <Card className="border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 p-8 flex flex-col gap-8">
                    <h3 className="font-bold text-foreground dark:text-slate-200">Regional Footprint</h3>
                    <div className="flex-1 flex items-center justify-center relative">
                        <div className="w-48 h-48 rounded-full border-8 border-slate-50 dark:border-slate-700 flex items-center justify-center relative">
                            <div className="text-center">
                                <p className="text-3xl font-semibold text-foreground">{activeBranches}</p>
                                <p className="text-xs font-bold text-muted-foreground uppercase">Active Branches</p>
                            </div>
                        </div>
                    </div>

                    <RegionalBreakdown stores={stores} />
                </Card>
            </div>
        </div>
    );
};

const regionColors = ['bg-indigo-600', 'bg-emerald-500', 'bg-amber-400', 'bg-rose-400', 'bg-purple-500'];

const RegionalBreakdown: React.FC<{ stores: any[] }> = ({ stores }) => {
    const regionMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const store of stores) {
            const region = store.region || 'Unassigned';
            map.set(region, (map.get(region) || 0) + 1);
        }
        return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
    }, [stores]);

    if (regionMap.length === 0) {
        return <p className="text-xs text-muted-foreground text-center py-4">No branches added yet</p>;
    }

    return (
        <div className="space-y-4">
            {regionMap.map((region, i) => (
                <div key={region.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${regionColors[i % regionColors.length]}`}></div>
                        <span className="text-xs font-bold text-muted-foreground">{region.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground font-mono">{region.count} {region.count === 1 ? 'Store' : 'Stores'}</span>
                </div>
            ))}
        </div>
    );
};

export default OrganizationDashboard;
