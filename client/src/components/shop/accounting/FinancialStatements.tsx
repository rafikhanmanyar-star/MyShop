
import React, { useState } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';

const FinancialStatements: React.FC = () => {
    const {
        totalRevenue, grossProfit, netMargin, totalCOGS, totalExpenses,
        netProfit, accounts, totalAssets, totalLiabilities, totalEquity,
        receivablesTotal, salesBySource, loading
    } = useAccounting();

    const [statementType, setStatementType] = useState<'pnl' | 'balanceSheet'>('pnl');

    // Expense accounts
    const expenseAccounts = accounts.filter((a: any) => a.type === 'Expense');
    const incomeAccounts = accounts.filter((a: any) => a.type === 'Income');
    const assetAccounts = accounts.filter((a: any) => a.type === 'Asset');

    const posRevenue = salesBySource?.pos?.totalRevenue || 0;
    const mobileRevenue = salesBySource?.mobile?.totalRevenue || 0;

    return (
        <div className="space-y-6 animate-fade-in flex flex-col h-full shadow-inner">
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2 p-1 bg-white border border-slate-200 rounded-xl">
                    <button
                        onClick={() => setStatementType('pnl')}
                        className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${statementType === 'pnl' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'
                            }`}
                    >
                        Profit & Loss
                    </button>
                    <button
                        onClick={() => setStatementType('balanceSheet')}
                        className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${statementType === 'balanceSheet' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'
                            }`}
                    >
                        Balance Sheet
                    </button>
                </div>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                        {ICONS.print} Print PDF
                    </button>
                </div>
            </div>

            {loading && (
                <div className="text-center py-4">
                    <div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                </div>
            )}

            <Card className="border-none shadow-sm flex-1 overflow-y-auto bg-white p-12 max-w-4xl mx-auto w-full font-serif border-t-8 border-slate-900 rounded-none shadow-2xl">
                <div className="text-center mb-12">
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-[0.2em]">MyShop Retail Enterprise</h2>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">
                        {statementType === 'pnl' ? 'Statement of Comprehensive Income' : 'Statement of Financial Position'}
                    </p>
                    <p className="text-[10px] text-slate-400 italic mt-1">For the period ended {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>

                {statementType === 'pnl' ? (
                    <div className="space-y-8">
                        {/* Revenue Section */}
                        <div>
                            <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-4">
                                <span className="text-sm font-black uppercase text-slate-800">1. Revenue / Turnover</span>
                                <span className="text-sm font-black text-slate-900">PKR</span>
                            </div>
                            {incomeAccounts.map((acc: any) => (
                                <div key={acc.id} className="flex justify-between px-4 mb-2 italic">
                                    <span className="text-sm text-slate-600">{acc.name}</span>
                                    <span className="text-sm font-bold text-slate-800">{Number(acc.balance).toLocaleString()}</span>
                                </div>
                            ))}
                            {incomeAccounts.length === 0 && (
                                <div className="flex justify-between px-4 mb-2 italic">
                                    <span className="text-sm text-slate-600">Total Sales Revenue</span>
                                    <span className="text-sm font-bold text-slate-800 underline decoration-slate-300">{totalRevenue.toLocaleString()}</span>
                                </div>
                            )}

                            {/* POS vs Mobile Breakdown */}
                            {(posRevenue > 0 || mobileRevenue > 0) && (
                                <div className="mt-3 ml-8 space-y-1 border-l-2 border-slate-200 pl-4">
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-400 italic">— POS Sales</span>
                                        <span className="font-mono text-slate-500">{posRevenue.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-400 italic">— Mobile App Orders</span>
                                        <span className="font-mono text-slate-500">{mobileRevenue.toLocaleString()}</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between px-4 font-black border-y border-slate-100 py-3 mt-4 bg-slate-50/50">
                                <span className="text-sm uppercase text-slate-800">Total Revenue</span>
                                <span className="text-sm font-mono">{totalRevenue.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* COGS Section */}
                        <div>
                            <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-4">
                                <span className="text-sm font-black uppercase text-slate-800">2. Cost of Sales</span>
                                <span className="text-sm font-black text-slate-400 italic font-mono">(Direct)</span>
                            </div>
                            <div className="flex justify-between px-4 mb-2 italic">
                                <span className="text-sm text-slate-600">Direct Cost of Goods Sold</span>
                                <span className="text-sm font-bold text-rose-600">({totalCOGS.toLocaleString()})</span>
                            </div>
                            <div className="flex justify-between px-4 font-black uppercase bg-indigo-50/30 py-4 border-y-2 border-indigo-100/50 mt-4 rounded">
                                <span className="text-sm text-indigo-900">Gross Profit (Margin: {netMargin.toFixed(1)}%)</span>
                                <span className="text-lg font-mono text-indigo-900 tracking-tight">{grossProfit.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Expenses Section */}
                        <div>
                            <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-4">
                                <span className="text-sm font-black uppercase text-slate-800">3. Operating Expenses</span>
                                <span className="text-sm font-black text-slate-400 italic font-mono">(Indirect)</span>
                            </div>
                            {expenseAccounts.filter(a => a.code !== 'EXP-500').map((acc: any) => (
                                <div key={acc.id} className="flex justify-between px-4 mb-3 italic group">
                                    <span className="text-sm text-slate-600 group-hover:pl-2 transition-all">{acc.name}</span>
                                    <span className="text-sm font-bold text-slate-400 group-hover:text-slate-900">{Number(acc.balance).toLocaleString()}</span>
                                </div>
                            ))}
                            {expenseAccounts.filter(a => a.code !== 'EXP-500').length === 0 && (
                                <div className="px-4 mb-3 italic text-sm text-slate-300">No indirect expenses recorded</div>
                            )}
                            <div className="flex justify-between px-4 font-black border-y border-dashed border-slate-200 py-3 mt-4">
                                <span className="text-sm uppercase text-slate-400 italic">Total Indirect Costs</span>
                                <span className="text-sm font-mono">({Math.max(0, totalExpenses - totalCOGS).toLocaleString()})</span>
                            </div>
                        </div>

                        {/* Net Profit Section */}
                        <div className="pt-10">
                            <div className="flex justify-between px-8 py-8 bg-slate-900 text-white rounded-3xl shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform"></div>
                                <div className="relative z-10">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Net Profit after Tax</p>
                                    <p className="text-xs italic opacity-40 mt-1">Consolidated Books</p>
                                </div>
                                <div className="relative z-10 text-right">
                                    <p className="text-3xl font-black font-mono tracking-tighter">{CURRENCY} {netProfit.toLocaleString()}</p>
                                    <div className="w-full h-1 bg-white/20 mt-2 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-400" style={{ width: `${Math.min(100, netMargin)}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Balance Sheet */
                    <div className="space-y-8">
                        {/* Assets */}
                        <div>
                            <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-4">
                                <span className="text-sm font-black uppercase text-slate-800">Assets</span>
                                <span className="text-sm font-black text-slate-900">PKR</span>
                            </div>
                            {assetAccounts.map((acc: any) => (
                                <div key={acc.id} className="flex justify-between px-4 mb-2 italic">
                                    <span className="text-sm text-slate-600">{acc.code} — {acc.name}</span>
                                    <span className="text-sm font-bold text-slate-800">{Number(acc.balance).toLocaleString()}</span>
                                </div>
                            ))}
                            {assetAccounts.length === 0 && (
                                <div className="px-4 text-sm text-slate-300 italic">No asset accounts</div>
                            )}
                            <div className="flex justify-between px-4 font-black border-y border-slate-100 py-3 mt-4 bg-slate-50/50">
                                <span className="text-sm uppercase text-slate-800">Total Assets</span>
                                <span className="text-sm font-mono">{totalAssets.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Liabilities */}
                        <div>
                            <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-4">
                                <span className="text-sm font-black uppercase text-slate-800">Liabilities</span>
                            </div>
                            {accounts.filter((a: any) => a.type === 'Liability').map((acc: any) => (
                                <div key={acc.id} className="flex justify-between px-4 mb-2 italic">
                                    <span className="text-sm text-slate-600">{acc.name}</span>
                                    <span className="text-sm font-bold text-slate-800">{Number(acc.balance).toLocaleString()}</span>
                                </div>
                            ))}
                            {accounts.filter((a: any) => a.type === 'Liability').length === 0 && (
                                <div className="px-4 text-sm text-slate-300 italic">No liabilities recorded</div>
                            )}
                            <div className="flex justify-between px-4 font-black border-y border-slate-100 py-3 mt-4 bg-slate-50/50">
                                <span className="text-sm uppercase text-slate-800">Total Liabilities</span>
                                <span className="text-sm font-mono">{totalLiabilities.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Equity */}
                        <div>
                            <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-4">
                                <span className="text-sm font-black uppercase text-slate-800">Equity</span>
                            </div>
                            <div className="flex justify-between px-4 mb-2 italic">
                                <span className="text-sm text-slate-600">Retained Earnings (Net Profit)</span>
                                <span className="text-sm font-bold text-emerald-700">{netProfit.toLocaleString()}</span>
                            </div>
                            {accounts.filter((a: any) => a.type === 'Equity').map((acc: any) => (
                                <div key={acc.id} className="flex justify-between px-4 mb-2 italic">
                                    <span className="text-sm text-slate-600">{acc.name}</span>
                                    <span className="text-sm font-bold text-slate-800">{Number(acc.balance).toLocaleString()}</span>
                                </div>
                            ))}
                            <div className="flex justify-between px-4 font-black border-y border-slate-100 py-3 mt-4 bg-indigo-50/30">
                                <span className="text-sm uppercase text-indigo-900">Total Equity</span>
                                <span className="text-lg font-mono text-indigo-900">{(totalEquity + netProfit).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Receivables Summary */}
                        {receivablesTotal > 0 && (
                            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-4">
                                <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                    {ICONS.alertTriangle}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-rose-900">Outstanding Receivables</p>
                                    <p className="text-xs text-rose-700">{CURRENCY} {receivablesTotal.toLocaleString()} in accounts receivable from credit sales.</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-20 pt-10 border-t border-slate-100 flex justify-between text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                    <span>Generated by MyShop Financial Engine</span>
                    <span>System ID: FB-2026-XN92</span>
                </div>
            </Card>
        </div>
    );
};

export default FinancialStatements;
