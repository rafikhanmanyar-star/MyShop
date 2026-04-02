import React, { useState, useEffect } from 'react';
import {
    Brain, TrendingUp, AlertTriangle, Package, DollarSign,
    RefreshCcw, ChevronRight, BarChart3, Info,
    ArrowUpRight, ArrowDownRight, Activity
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import { forecastApi, ForecastDashboardData } from '../../services/forecastApi';
import { CURRENCY } from '../../constants';

const chartTooltipStyle = {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '1rem',
    color: 'var(--card-foreground)',
} as const;

const ForecastPage: React.FC = () => {
    const [data, setData] = useState<ForecastDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await forecastApi.getDashboard(month, year) as any;

            // Sanitize numerical data (Decimals come as strings from DB)
            if (res?.summary) {
                res.summary.confidence_score = Number(res.summary.confidence_score) || 0;
                res.summary.total_projected_revenue = Number(res.summary.total_projected_revenue) || 0;
                res.summary.total_projected_profit = Number(res.summary.total_projected_profit) || 0;
            }
            if (res?.categories) {
                res.categories = res.categories.map((c: any) => ({
                    ...c,
                    forecast_revenue: Number(c.forecast_revenue) || 0,
                    forecast_profit: Number(c.forecast_profit) || 0
                }));
            }
            if (res?.products) {
                res.products = res.products.map((p: any) => ({
                    ...p,
                    planned_quantity: Number(p.planned_quantity) || 0,
                    historical_avg_quantity: Number(p.historical_avg_quantity) || 0,
                    forecast_quantity: Number(p.forecast_quantity) || 0,
                    forecast_revenue: Number(p.forecast_revenue) || 0,
                    forecast_profit: Number(p.forecast_profit) || 0
                }));
            }
            if (res?.cashFlow) {
                res.cashFlow.projected_inflow = Number(res.cashFlow.projected_inflow) || 0;
                res.cashFlow.projected_outflow = Number(res.cashFlow.projected_outflow) || 0;
                res.cashFlow.working_capital_requirement = Number(res.cashFlow.working_capital_requirement) || 0;
            }
            if (res?.inventoryRisks) {
                res.inventoryRisks = res.inventoryRisks.map((r: any) => ({
                    ...r,
                    forecast_revenue: Number(r.forecast_revenue) || 0,
                    stock_out_risk_percent: Number(r.stock_out_risk_percent) || 0
                }));
            }

            setData(res);
        } catch (error) {
            console.error('Error fetching forecast:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [month, year]);

    const handleRunForecast = async () => {
        setRunning(true);
        try {
            await forecastApi.runForecast({ month, year });
            await fetchData();
        } catch (error) {
            alert('Failed to run forecast');
        } finally {
            setRunning(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: CURRENCY,
            maximumFractionDigits: 0
        }).format(val);
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] bg-muted/80 dark:bg-slate-800 -m-4 md:-m-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mb-4" />
                <p className="text-muted-foreground dark:text-slate-400 font-medium">Analyzing demand patterns...</p>
            </div>
        );
    }

    if (data?.needsRun) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 bg-muted/80 dark:bg-slate-800 -m-4 md:-m-8">
                <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-950/60 rounded-3xl flex items-center justify-center mb-6 border border-indigo-200/80 dark:border-indigo-800/50">
                    <Brain className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold text-foreground dark:text-slate-200 mb-2">Initialize Forecast Engine</h2>
                <p className="text-muted-foreground dark:text-slate-400 max-w-md mb-8">
                    No forecast data available for {new Date(year, month - 1).toLocaleString('default', { month: 'long' })} {year}.
                    Run the engine to analyze budgets and historical sales.
                </p>
                <button
                    onClick={handleRunForecast}
                    disabled={running}
                    className="px-8 py-4 bg-indigo-600 dark:bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-500/20 dark:shadow-indigo-900/40 hover:bg-indigo-700 dark:hover:bg-indigo-500 transition-all flex items-center gap-3 disabled:opacity-50"
                >
                    {running ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
                    Generate Monthly Forecast
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-muted/80 dark:bg-slate-800 -m-4 md:-m-8 p-8 pb-12">
            <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 bg-indigo-600 dark:bg-indigo-500 rounded-lg text-white shadow-sm">
                            <Brain className="w-5 h-5" />
                        </div>
                        <h1 className="text-3xl font-semibold text-foreground dark:text-slate-100 tracking-tight">Demand Intelligence</h1>
                    </div>
                    <p className="text-muted-foreground dark:text-slate-400 font-medium ml-12">Predictive analytics driven by consumer intent & historical trends.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex bg-card dark:bg-slate-900 rounded-2xl p-1 shadow-sm border border-border dark:border-slate-700">
                        <select
                            aria-label="Forecast month"
                            value={month}
                            onChange={(e) => setMonth(parseInt(e.target.value))}
                            className="bg-transparent border-none text-sm font-bold text-foreground dark:text-slate-100 px-4 py-2 focus:ring-0 cursor-pointer"
                        >
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                    {new Date(0, i).toLocaleString('default', { month: 'long' })}
                                </option>
                            ))}
                        </select>
                        <select
                            aria-label="Forecast year"
                            value={year}
                            onChange={(e) => setYear(parseInt(e.target.value))}
                            className="bg-transparent border-none text-sm font-bold text-foreground dark:text-slate-100 px-4 py-2 focus:ring-0 cursor-pointer"
                        >
                            {[2024, 2025, 2026].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handleRunForecast}
                        disabled={running}
                        className="p-3 bg-card dark:bg-slate-900 text-foreground dark:text-slate-200 rounded-2xl shadow-sm border border-border dark:border-slate-700 hover:bg-muted/50 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
                        title="Regenerate Forecast"
                    >
                        <RefreshCcw className={`w-5 h-5 ${running ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-card dark:bg-slate-900/60 p-6 rounded-[2rem] shadow-sm border border-border dark:border-slate-700 hover:shadow-md dark:hover:shadow-slate-950/50 transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-100/80 dark:border-indigo-800/40">
                            <DollarSign className="w-6 h-6" />
                        </div>
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg text-xs font-bold border border-emerald-100/80 dark:border-emerald-800/40">
                            <ArrowUpRight className="w-3 h-3" />
                            12.5%
                        </div>
                    </div>
                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Projected Revenue</p>
                    <h3 className="text-2xl font-semibold text-foreground">{formatCurrency(Number(data?.summary?.total_projected_revenue) || 0)}</h3>
                </div>

                <div className="bg-card dark:bg-slate-900/60 p-6 rounded-[2rem] shadow-sm border border-border dark:border-slate-700 hover:shadow-md dark:hover:shadow-slate-950/50 transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-600 dark:text-fuchsia-400 rounded-2xl border border-fuchsia-100/80 dark:border-fuchsia-800/40">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg text-xs font-bold border border-emerald-100/80 dark:border-emerald-800/40">
                            <ArrowUpRight className="w-3 h-3" />
                            8.2%
                        </div>
                    </div>
                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Expected Profit</p>
                    <h3 className="text-2xl font-semibold text-foreground">{formatCurrency(Number(data?.summary?.total_projected_profit) || 0)}</h3>
                </div>

                <div className="bg-card dark:bg-slate-900/60 p-6 rounded-[2rem] shadow-sm border border-border dark:border-slate-700 hover:shadow-md dark:hover:shadow-slate-950/50 transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-100/80 dark:border-amber-800/40">
                            <Package className="w-6 h-6" />
                        </div>
                        <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-1 rounded-lg text-xs font-bold border border-rose-100/80 dark:border-rose-800/40">
                            <ArrowDownRight className="w-3 h-3" />
                            5 Risks
                        </div>
                    </div>
                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Inventory Alert</p>
                    <h3 className="text-2xl font-semibold text-foreground">{data?.inventoryRisks?.length || 0} Items</h3>
                </div>

                <div className="bg-card dark:bg-slate-900/60 p-6 rounded-[2rem] shadow-sm border border-border dark:border-slate-700 hover:shadow-md dark:hover:shadow-slate-950/50 transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-100/80 dark:border-blue-800/40">
                            <Info className="w-6 h-6" />
                        </div>
                        <div className="text-xs font-bold text-muted-foreground dark:text-slate-400 bg-muted/80 dark:bg-slate-800 px-2 py-1 rounded-lg border border-border/80 dark:border-slate-600">
                            AI Confidence
                        </div>
                    </div>
                    <p className="text-muted-foreground dark:text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Forecast Accuracy</p>
                    <div className="flex items-end gap-3">
                        <h3 className="text-2xl font-semibold text-foreground dark:text-slate-100">{Number(data?.summary?.confidence_score || 0).toFixed(0)}%</h3>
                        <div className="flex-1 h-3 bg-muted dark:bg-slate-800 rounded-full mb-1.5 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                                style={{ width: `${Number(data?.summary?.confidence_score || 0)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Category Demand */}
                <div className="bg-card dark:bg-slate-900/60 p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 border border-border dark:border-slate-700">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h3 className="text-xl font-semibold text-foreground dark:text-slate-100 tracking-tight">Category Opportunities</h3>
                            <p className="text-muted-foreground dark:text-slate-400 text-sm">Where the demand is growing.</p>
                        </div>
                        <div className="p-2 bg-muted/80 dark:bg-slate-800 rounded-xl border border-border/80 dark:border-slate-600">
                            <BarChart3 className="w-5 h-5 text-muted-foreground" />
                        </div>
                    </div>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.categories || []} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" />
                                <XAxis type="number" hide />
                                <YAxis
                                    dataKey="category_name"
                                    type="category"
                                    width={100}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fontWeight: 600, fill: 'var(--muted-foreground)' }}
                                />
                                <Tooltip
                                    cursor={{ fill: 'var(--muted)' }}
                                    contentStyle={chartTooltipStyle}
                                />
                                <Bar dataKey="forecast_revenue" radius={[0, 8, 8, 0]} barSize={24}>
                                    {data?.categories?.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#4f46e5' : '#8b5cf6'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Cash Flow Forecast */}
                <div className="bg-card dark:bg-slate-900/60 p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 border border-border dark:border-slate-700">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h3 className="text-xl font-semibold text-foreground dark:text-slate-100 tracking-tight">Liquidity Forecast</h3>
                            <p className="text-muted-foreground dark:text-slate-400 text-sm">Cash Flow Impact Analysis.</p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest border ${data?.cashFlow?.liquidity_risk_level === 'Low' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/50' :
                            data?.cashFlow?.liquidity_risk_level === 'Medium' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800/50' :
                                'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800/50'
                            }`}>
                            {data?.cashFlow?.liquidity_risk_level} Risk
                        </div>
                    </div>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={[
                                { name: 'Current', inflow: 0, outflow: 0 },
                                { name: 'Week 1', inflow: (data?.cashFlow.projected_inflow || 0) * 0.2, outflow: (data?.cashFlow.projected_outflow || 0) * 0.3 },
                                { name: 'Week 2', inflow: (data?.cashFlow.projected_inflow || 0) * 0.5, outflow: (data?.cashFlow.projected_outflow || 0) * 0.5 },
                                { name: 'Week 3', inflow: (data?.cashFlow.projected_inflow || 0) * 0.8, outflow: (data?.cashFlow.projected_outflow || 0) * 0.7 },
                                { name: 'Final', inflow: (data?.cashFlow.projected_inflow || 0), outflow: (data?.cashFlow.projected_outflow || 0) },
                            ]}>
                                <defs>
                                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: 'var(--muted-foreground)' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: 'var(--muted-foreground)' }} />
                                <Tooltip contentStyle={chartTooltipStyle} />
                                <Area type="monotone" dataKey="inflow" name="Cash Inflow" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIn)" />
                                <Area type="monotone" dataKey="outflow" name="Cash Outflow" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorOut)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Tables Row */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Inventory Risks */}
                <div className="xl:col-span-1 bg-card dark:bg-slate-900/60 p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 border border-border dark:border-slate-700 flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                        <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                        <h3 className="text-xl font-semibold text-foreground dark:text-slate-100 tracking-tight">Stock Risks</h3>
                    </div>
                    <div className="space-y-4 flex-1">
                        {data?.inventoryRisks?.map((risk: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-muted/80 dark:bg-slate-800/60 rounded-2xl border border-border dark:border-slate-700">
                                <div>
                                    <p className="text-sm font-bold text-foreground dark:text-slate-100 line-clamp-1">{risk.product_name}</p>
                                    <p className={`text-xs font-semibold uppercase inline-block px-2 py-0.5 rounded-md mt-1 ${risk.stock_risk_level === 'Stock-Out' ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                                        }`}>
                                        {risk.stock_risk_level}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-foreground">{formatCurrency(Number(risk.forecast_revenue))}</p>
                                    <p className="text-xs font-medium text-muted-foreground">Projected Revenue</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="mt-6 w-full py-3 text-sm font-semibold text-muted-foreground dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-2">
                        View All Risks <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Demand Forecast List */}
                <div className="xl:col-span-2 bg-card dark:bg-slate-900/60 p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 border border-border dark:border-slate-700">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-semibold text-foreground dark:text-slate-100 tracking-tight">Top High-Demand Products</h3>
                        <button className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold uppercase tracking-widest hover:underline">Full Report</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left">
                                    <th className="pb-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Product</th>
                                    <th className="pb-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center">Intent (Budgets)</th>
                                    <th className="pb-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center">Historical Avg</th>
                                    <th className="pb-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center">Forecast Qty</th>
                                    <th className="pb-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest text-right">Proj. Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.products?.map((prod: any, i: number) => (
                                    <tr key={i} className="border-t border-slate-50 dark:border-slate-800 group hover:bg-muted/50/50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="py-4">
                                            <p className="text-sm font-bold text-foreground dark:text-slate-100">{prod.product_name}</p>
                                            <p className="text-xs font-medium text-muted-foreground dark:text-slate-400">{prod.category_name}</p>
                                        </td>
                                        <td className="py-4 text-center font-bold text-sm text-muted-foreground">{prod.planned_quantity}</td>
                                        <td className="py-4 text-center font-bold text-sm text-muted-foreground">{Number(prod.historical_avg_quantity).toFixed(1)}</td>
                                        <td className="py-4 text-center">
                                            <span className="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg text-sm font-semibold border border-indigo-100/80 dark:border-indigo-800/40">
                                                {Number(prod.forecast_quantity).toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="py-4 text-right font-semibold text-sm text-foreground">{formatCurrency(Number(prod.forecast_revenue))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Smart Insights Footer */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-slate-950 dark:to-indigo-950 p-8 rounded-[2.5rem] shadow-2xl text-white border border-white/5 dark:border-slate-700/50">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-indigo-500 dark:bg-indigo-600 rounded-xl flex items-center justify-center">
                        <Activity className="w-4 h-4" />
                    </div>
                    <h3 className="text-xl font-semibold tracking-tight text-white">AI-Generated Insights</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 bg-card/5 rounded-2xl border border-white/10 dark:border-white/10">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">Inventory Strategy</p>
                        <p className="text-sm font-medium leading-relaxed">
                            Consumer budgets indicate <span className="text-indigo-400 font-bold">18% higher demand</span> for Beverages next month. Consider increasing procurement for top 5 items.
                        </p>
                    </div>
                    <div className="p-4 bg-card/5 rounded-2xl border border-white/10 dark:border-white/10">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">Revenue Growth</p>
                        <p className="text-sm font-medium leading-relaxed">
                            Projected revenue growth of <span className="text-emerald-400 font-bold">12%</span> compared to last 3 months average, driven by 42 unique customer budgets.
                        </p>
                    </div>
                    <div className="p-4 bg-card/5 rounded-2xl border border-white/10 dark:border-white/10">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">Risk Mitigation</p>
                        <p className="text-sm font-medium leading-relaxed">
                            Stock-out risk detected for <span className="text-amber-400 font-bold">5 high-demand items</span>. Working capital requirement will increase by {formatCurrency(Number(data?.cashFlow?.working_capital_requirement) || 0)}.
                        </p>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
};

export default ForecastPage;
