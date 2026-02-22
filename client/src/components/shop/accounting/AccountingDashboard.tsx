
import React from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';

const AccountingDashboard: React.FC = () => {
    const {
        accounts, bankAccounts, totalRevenue, grossProfit, netMargin,
        receivablesTotal, salesBySource, totalCOGS, netProfit, loading
    } = useAccounting();

    const metrics = [
        { label: 'Total Revenue', value: totalRevenue, icon: ICONS.trendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Gross Profit', value: grossProfit, icon: ICONS.dollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Margin %', value: `${netMargin.toFixed(1)}%`, icon: ICONS.barChart, color: 'text-amber-600', bg: 'bg-amber-50', isString: true },
        { label: 'Receivables', value: receivablesTotal, icon: ICONS.arrowDownCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    ];

    const posRevenue = salesBySource?.pos?.totalRevenue || 0;
    const mobileRevenue = salesBySource?.mobile?.totalRevenue || 0;
    const totalSalesRevenue = posRevenue + mobileRevenue;
    const posPercent = totalSalesRevenue > 0 ? (posRevenue / totalSalesRevenue) * 100 : 0;
    const mobilePercent = totalSalesRevenue > 0 ? (mobileRevenue / totalSalesRevenue) * 100 : 0;

    return (
        <div className="space-y-8 animate-fade-in">
            {loading && (
                <div className="text-center py-4">
                    <div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                    <p className="text-xs text-slate-400 mt-2">Loading financial data...</p>
                </div>
            )}

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {metrics.map((m, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className={`w-14 h-14 rounded-2xl ${m.bg} ${m.color} flex items-center justify-center`}>
                            {React.cloneElement(m.icon as React.ReactElement<any>, { width: 28, height: 28 })}
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{m.label}</p>
                            <p className="text-2xl font-black text-slate-800 tracking-tight">
                                {m.isString ? m.value : `${CURRENCY} ${Number(m.value || 0).toLocaleString()}`}
                            </p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Revenue by Source — POS vs Mobile */}
                <Card className="lg:col-span-2 border-none shadow-sm p-8 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">Revenue by Source</h3>
                        <div className="flex gap-4">
                            <span className="flex items-center gap-2 text-[10px] font-bold text-indigo-600">
                                <span className="w-2 h-2 bg-indigo-600 rounded-full"></span> POS Sales
                            </span>
                            <span className="flex items-center gap-2 text-[10px] font-bold text-emerald-600">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Mobile App Orders
                            </span>
                        </div>
                    </div>

                    {totalSalesRevenue > 0 ? (
                        <div className="space-y-6">
                            {/* POS */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-sm font-black text-slate-800">POS Sales</p>
                                        <p className="text-[10px] text-slate-400 font-bold">{salesBySource?.pos?.totalOrders || 0} transactions</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-black text-slate-800 font-mono">{CURRENCY} {posRevenue.toLocaleString()}</p>
                                        <p className="text-[10px] text-indigo-500 font-black">{posPercent.toFixed(1)}%</p>
                                    </div>
                                </div>
                                <div className="h-3 bg-slate-50 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-600 transition-all duration-1000 rounded-full" style={{ width: `${posPercent}%` }}></div>
                                </div>
                            </div>

                            {/* Mobile */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-sm font-black text-slate-800">Mobile App Orders</p>
                                        <p className="text-[10px] text-slate-400 font-bold">{salesBySource?.mobile?.totalOrders || 0} orders</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-black text-slate-800 font-mono">{CURRENCY} {mobileRevenue.toLocaleString()}</p>
                                        <p className="text-[10px] text-emerald-500 font-black">{mobilePercent.toFixed(1)}%</p>
                                    </div>
                                </div>
                                <div className="h-3 bg-slate-50 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 transition-all duration-1000 rounded-full" style={{ width: `${mobilePercent}%` }}></div>
                                </div>
                            </div>

                            {/* Avg Order Value Comparison */}
                            <div className="flex gap-4 pt-4 border-t border-slate-100">
                                <div className="flex-1 p-4 bg-indigo-50 rounded-xl">
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">POS Avg. Order</p>
                                    <p className="text-lg font-black text-indigo-900 font-mono">{CURRENCY} {(salesBySource?.pos?.avgOrderValue || 0).toFixed(0)}</p>
                                </div>
                                <div className="flex-1 p-4 bg-emerald-50 rounded-xl">
                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Mobile Avg. Order</p>
                                    <p className="text-lg font-black text-emerald-900 font-mono">{CURRENCY} {(salesBySource?.mobile?.avgOrderValue || 0).toFixed(0)}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-64 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex items-center justify-center text-slate-300">
                            <div className="text-center">
                                {React.cloneElement(ICONS.barChart as React.ReactElement<any>, { width: 48, height: 48, className: 'mx-auto opacity-20' })}
                                <p className="text-xs font-bold uppercase tracking-widest mt-2">No sales data yet. Complete a sale to see data here.</p>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Cash & Bank Summary */}
                <Card className="border-none shadow-sm p-6 space-y-6 flex flex-col">
                    <h3 className="font-bold text-slate-800">Cash & Bank Balances</h3>
                    <div className="space-y-4 flex-1 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                        {bankAccounts.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-xs font-medium">
                                No bank accounts linked yet. Use Settings to create them.
                            </div>
                        ) : (
                            bankAccounts.map((acc: any, i: number) => (
                                <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 shadow-sm border border-slate-100 group-hover:text-indigo-600">
                                            {acc.account_type === 'Cash' ? ICONS.wallet : ICONS.building}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">{acc.name}</p>
                                            <p className="text-[10px] text-slate-400 font-medium uppercase">{acc.code || acc.account_type}</p>
                                        </div>
                                    </div>
                                    <div className="text-sm font-black text-slate-900 font-mono">
                                        {CURRENCY} {(parseFloat(acc.balance) || 0).toLocaleString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Account Ledger Balances */}
                    {accounts.filter(a => a.type === 'Asset').length > 0 && (
                        <div className="border-t border-slate-100 pt-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Ledger Account Balances</p>
                            <div className="space-y-2">
                                {accounts.filter(a => a.type === 'Asset' || a.type === 'Income').slice(0, 5).map((acc: any, i: number) => (
                                    <div key={i} className="flex justify-between text-xs">
                                        <span className="text-slate-600 font-medium">{acc.code} — {acc.name}</span>
                                        <span className="font-mono font-bold text-slate-800">{acc.balance.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {/* Exception Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {totalCOGS > 0 && (
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-4">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            {ICONS.dollarSign}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-indigo-900">Cost of Goods Sold</p>
                            <p className="text-xs text-indigo-700">{CURRENCY} {totalCOGS.toLocaleString()} — deducted from revenue for gross profit.</p>
                        </div>
                    </div>
                )}
                {netProfit > 0 ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-4">
                        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                            {ICONS.trendingUp}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-emerald-900">Net Profit</p>
                            <p className="text-xs text-emerald-700">{CURRENCY} {netProfit.toLocaleString()} — all accounts reconciled from ledger.</p>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-4">
                        <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                            {ICONS.alertTriangle}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-amber-900">No Profit Data</p>
                            <p className="text-xs text-amber-700">Complete sales transactions to see profit analysis.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AccountingDashboard;
