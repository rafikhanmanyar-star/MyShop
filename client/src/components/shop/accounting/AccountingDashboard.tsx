
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAccounting } from '../../../context/AccountingContext';
import { accountingApi } from '../../../services/shopApi';
import { CURRENCY, ICONS } from '../../../constants';

type RevenueView = 'monthly' | 'weekly';

function dayKey(d: unknown): string {
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const s = String(d ?? '');
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function mergeDailyTrend(pos: any[] | undefined, mobile: any[] | undefined): Map<string, { pos: number; mobile: number }> {
    const m = new Map<string, { pos: number; mobile: number }>();
    for (const r of pos || []) {
        const k = dayKey(r.day);
        const row = m.get(k) || { pos: 0, mobile: 0 };
        row.pos = Number(r.revenue) || 0;
        m.set(k, row);
    }
    for (const r of mobile || []) {
        const k = dayKey(r.day);
        const row = m.get(k) || { pos: 0, mobile: 0 };
        row.mobile = Number(r.revenue) || 0;
        m.set(k, row);
    }
    return m;
}

/** UTC Monday date (YYYY-MM-DD) for the week containing `isoDate`. */
function weekBucketKey(isoDate: string): string {
    const d = new Date(`${isoDate}T12:00:00.000Z`);
    const dow = d.getUTCDay();
    const daysFromMonday = (dow + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysFromMonday);
    return d.toISOString().slice(0, 10);
}

type Bucket = { label: string; pos: number; mobile: number; b2b: number; marketplace: number };

function aggregateBuckets(
    daily: Map<string, { pos: number; mobile: number }>,
    view: RevenueView
): Bucket[] {
    const sortedDays = [...daily.keys()].sort();
    if (sortedDays.length === 0) return [];

    if (view === 'weekly') {
        const w = new Map<string, { pos: number; mobile: number }>();
        for (const day of sortedDays) {
            const k = weekBucketKey(day);
            const cur = w.get(k) || { pos: 0, mobile: 0 };
            const row = daily.get(day)!;
            cur.pos += row.pos;
            cur.mobile += row.mobile;
            w.set(k, cur);
        }
        return [...w.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-8)
            .map(([label, v]) => ({
                label,
                pos: v.pos,
                mobile: v.mobile,
                b2b: 0,
                marketplace: 0,
            }));
    }

    const mo = new Map<string, { pos: number; mobile: number }>();
    for (const day of sortedDays) {
        const k = day.slice(0, 7);
        const cur = mo.get(k) || { pos: 0, mobile: 0 };
        const row = daily.get(day)!;
        cur.pos += row.pos;
        cur.mobile += row.mobile;
        mo.set(k, cur);
    }
    return [...mo.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([label, v]) => ({
            label,
            pos: v.pos,
            mobile: v.mobile,
            b2b: 0,
            marketplace: 0,
        }));
}

function sumWindow(
    daily: Map<string, { pos: number; mobile: number }>,
    sortedDays: string[],
    startIdx: number,
    len: number
): number {
    let s = 0;
    const from = Math.max(0, sortedDays.length - startIdx - len);
    const to = Math.max(0, sortedDays.length - startIdx);
    for (let i = from; i < to; i++) {
        const row = daily.get(sortedDays[i]);
        if (row) s += row.pos + row.mobile;
    }
    return s;
}

const MiniBars: React.FC<{ values: number[]; className?: string }> = ({ values, className }) => {
    const max = Math.max(...values, 1);
    return (
        <div className={`flex items-end gap-0.5 h-8 ${className ?? ''}`}>
            {values.map((v, i) => (
                <div
                    key={i}
                    className="flex-1 min-w-[3px] max-w-[10px] rounded-sm bg-indigo-400/90 dark:bg-indigo-500"
                    style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
                />
            ))}
        </div>
    );
};

const RevenueBarChart: React.FC<{ buckets: Bucket[] }> = ({ buckets }) => {
    const max = Math.max(
        1,
        ...buckets.flatMap((b) => [b.pos, b.mobile, b.b2b, b.marketplace])
    );
    const barW = buckets.length > 0 ? Math.max(4, Math.min(28, Math.floor(220 / (buckets.length * 4)))) : 8;
    return (
        <div className="flex min-h-[200px] flex-col justify-end pt-4">
            <div className="flex flex-1 items-end justify-center gap-3 border-b border-slate-200/80 pb-2 dark:border-slate-700">
                {buckets.length === 0 ? (
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500">No trend data in this range.</p>
                ) : (
                    buckets.map((b) => (
                        <div key={b.label} className="flex flex-col items-center gap-1">
                            <div className="flex items-end gap-0.5" style={{ height: 160 }}>
                                {[
                                    { v: b.pos, cls: 'bg-[#1e3a5f]' },
                                    { v: b.mobile, cls: 'bg-sky-500' },
                                    { v: b.b2b, cls: 'bg-violet-500' },
                                    { v: b.marketplace, cls: 'bg-amber-500' },
                                ].map((seg, i) => (
                                    <div
                                        key={i}
                                        className={`rounded-t ${seg.cls} opacity-90`}
                                        style={{
                                            width: barW,
                                            height: `${Math.max(4, (seg.v / max) * 160)}px`,
                                        }}
                                        title={`${seg.v.toLocaleString()}`}
                                    />
                                ))}
                            </div>
                            <span className="max-w-[4.5rem] truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {b.label}
                            </span>
                        </div>
                    ))
                )}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-[#1e3a5f]" /> POS Sales
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-sky-500" /> App Orders
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-violet-500" /> Direct B2B
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-amber-500" /> Marketplace
                </span>
            </div>
        </div>
    );
};

const AccountingDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {
        accounts,
        bankAccounts,
        totalRevenue,
        grossProfit,
        netMargin,
        receivablesTotal,
        salesBySource,
        totalCOGS,
        netProfit,
        totalAssets,
        loading,
    } = useAccounting();

    const revenueParam = (searchParams.get('revenue') || 'weekly').toLowerCase();
    const revenueView: RevenueView = revenueParam === 'monthly' ? 'monthly' : 'weekly';

    const setRevenueView = useCallback(
        (v: RevenueView) => {
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (v === 'weekly') next.delete('revenue');
                    else next.set('revenue', 'monthly');
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const [trend, setTrend] = useState<{ pos: any[]; mobile: any[] } | null>(null);
    const [trendLoading, setTrendLoading] = useState(true);

    const trendDays = revenueView === 'monthly' ? 370 : 56;

    useEffect(() => {
        let cancelled = false;
        setTrendLoading(true);
        accountingApi
            .getDailyTrend(trendDays)
            .then((data) => {
                if (!cancelled) setTrend(data || null);
            })
            .catch(() => {
                if (!cancelled) setTrend(null);
            })
            .finally(() => {
                if (!cancelled) setTrendLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [trendDays]);

    const dailyMap = useMemo(() => mergeDailyTrend(trend?.pos, trend?.mobile), [trend]);
    const sortedDays = useMemo(() => [...dailyMap.keys()].sort(), [dailyMap]);

    const buckets = useMemo(() => aggregateBuckets(dailyMap, revenueView), [dailyMap, revenueView]);

    const sparkValues = useMemo(() => {
        const last = sortedDays.slice(-14);
        return last.map((d) => {
            const row = dailyMap.get(d);
            return (row?.pos || 0) + (row?.mobile || 0);
        });
    }, [sortedDays, dailyMap]);

    const revenueVsPriorPct = useMemo(() => {
        if (sortedDays.length < 8) return null;
        const last30 = sumWindow(dailyMap, sortedDays, 0, 30);
        const prev30 = sumWindow(dailyMap, sortedDays, 30, 30);
        if (prev30 <= 0 && last30 <= 0) return null;
        if (prev30 <= 0) return 100;
        return ((last30 - prev30) / prev30) * 100;
    }, [sortedDays, dailyMap]);

    const overdueInvoices = salesBySource?.mobile?.unpaidCount ?? 0;

    const posAvg = salesBySource?.pos?.avgOrderValue ?? 0;
    const mobileAvg = salesBySource?.mobile?.avgOrderValue ?? 0;
    const posOrders = salesBySource?.pos?.totalOrders || 0;
    const mobileOrders = salesBySource?.mobile?.totalOrders || 0;
    const posFreq = posOrders > 0 ? (posOrders / Math.max(1, sortedDays.length || 30)).toFixed(1) : '0';
    const activeUsersLabel =
        mobileOrders >= 1000 ? `${(mobileOrders / 1000).toFixed(1)}k orders` : `${mobileOrders} orders`;

    const ledgerRows = useMemo(() => {
        const findBal = (pred: (a: any) => boolean) => {
            const a = accounts.find(pred);
            return a ? (Number(a.balance) || 0) : null;
        };
        const rows: { name: string; balance: number }[] = [];
        const arAcc = findBal((a) => a.code === '11201' || a.code === 'AST-120' || /receivable/i.test(a.name));
        rows.push({ name: 'Accounts Receivable', balance: arAcc != null ? arAcc : receivablesTotal });
        const prepaid =
            findBal((a) => String(a.code).startsWith('114') || /prepaid/i.test(a.name)) ??
            findBal((a) => a.type === 'Asset' && /prepaid/i.test(a.name)) ??
            0;
        rows.push({ name: 'Prepaid Expenses', balance: prepaid || 0 });
        const inv =
            findBal((a) => String(a.code).startsWith('113') || /inventory/i.test(a.name)) ??
            findBal((a) => a.type === 'Asset' && /inventory|merchandise/i.test(a.name)) ??
            0;
        rows.push({ name: 'Inventory Asset', balance: inv || 0 });
        const apRaw =
            findBal((a) => a.code === '21101' || /trade payable|accounts payable/i.test(a.name)) ??
            findBal((a) => a.type === 'Liability' && /payable/i.test(a.name)) ??
            0;
        rows.push({
            name: 'Accounts Payable',
            balance: apRaw ? -Math.abs(Number(apRaw)) : 0,
        });
        return rows;
    }, [accounts, receivablesTotal]);

    const fmtMoney = (n: number) => `${CURRENCY} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const nextUtcMidnight = useMemo(() => {
        const t = new Date();
        t.setUTCHours(24, 0, 0, 0);
        return t.toISOString().slice(0, 16).replace('T', ' ');
    }, []);

    const zap = (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/90">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
    );

    return (
        <div className="animate-fade-in mx-auto max-w-[1600px] space-y-6 text-[#0f172a] dark:text-slate-100">
            {(loading || trendLoading) && (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#1e3a5f] border-t-transparent dark:border-sky-400" />
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Loading financial data…</p>
                </div>
            )}

            {/* KPI row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="absolute right-4 top-4 text-violet-500 opacity-90">
                        {React.cloneElement(ICONS.trendingUp as React.ReactElement<any>, { width: 22, height: 22 })}
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Total Revenue</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-[#0f172a] dark:text-white">{fmtMoney(totalRevenue)}</p>
                    <div className="mt-4 pr-8">
                        <MiniBars values={sparkValues.length ? sparkValues : [0, 0, 0, 0, 0, 0, 0]} />
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="absolute right-4 top-4 text-violet-500 opacity-90">
                        {React.cloneElement(ICONS.dollarSign as React.ReactElement<any>, { width: 22, height: 22 })}
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Gross Profit</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-[#0f172a] dark:text-white">{fmtMoney(grossProfit)}</p>
                    {revenueVsPriorPct != null && (
                        <p
                            className={`mt-2 text-xs font-bold ${revenueVsPriorPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                        >
                            {revenueVsPriorPct >= 0 ? '↑' : '↓'} {Math.abs(revenueVsPriorPct).toFixed(1)}% vs prior 30 days (revenue)
                        </p>
                    )}
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="absolute right-4 top-4 text-slate-400">
                        {React.cloneElement(ICONS.barChart as React.ReactElement<any>, { width: 22, height: 22 })}
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Margin %</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-[#0f172a] dark:text-white">{netMargin.toFixed(1)}%</p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                            className="h-full rounded-full bg-sky-600 transition-all dark:bg-sky-500"
                            style={{ width: `${Math.min(100, Math.max(0, netMargin))}%` }}
                        />
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="absolute right-4 top-4 text-rose-500">
                        {React.cloneElement(ICONS.clock as React.ReactElement<any>, { width: 22, height: 22 })}
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Receivables</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-[#0f172a] dark:text-white">{fmtMoney(receivablesTotal)}</p>
                    <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
                        {overdueInvoices > 0
                            ? `${overdueInvoices} unpaid delivered invoice${overdueInvoices === 1 ? '' : 's'}`
                            : 'No overdue mobile invoices'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {/* Revenue by source */}
                <div className="xl:col-span-2 space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <h2 className="text-lg font-bold text-[#0f172a] dark:text-white">Revenue by Source</h2>
                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-600 dark:bg-slate-800">
                            <button
                                type="button"
                                onClick={() => setRevenueView('monthly')}
                                className={`rounded-md px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                                    revenueView === 'monthly'
                                        ? 'bg-[#1e3a5f] text-white shadow-sm dark:bg-sky-600'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                            >
                                Monthly
                            </button>
                            <button
                                type="button"
                                onClick={() => setRevenueView('weekly')}
                                className={`rounded-md px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                                    revenueView === 'weekly'
                                        ? 'bg-[#1e3a5f] text-white shadow-sm dark:bg-sky-600'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                            >
                                Weekly
                            </button>
                        </div>
                    </div>

                    <RevenueBarChart buckets={buckets} />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-800/40">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">POS Avg. Order</p>
                            <p className="mt-1 font-mono text-lg font-bold text-[#0f172a] dark:text-white">
                                {CURRENCY} {posAvg.toFixed(2)}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Avg. frequency: {posFreq}/day (in range)</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-800/40">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Mobile Avg. Order</p>
                            <p className="mt-1 font-mono text-lg font-bold text-[#0f172a] dark:text-white">
                                {CURRENCY} {mobileAvg.toFixed(2)}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Volume: {activeUsersLabel}</p>
                        </div>
                    </div>
                </div>

                {/* Right column */}
                <div className="flex flex-col gap-6">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                        <div className="mb-4 flex items-center gap-2">
                            {React.cloneElement(ICONS.building as React.ReactElement<any>, { width: 18, height: 18, className: 'text-slate-600 dark:text-slate-300' })}
                            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Cash & Bank Balances</h3>
                        </div>
                        <div className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
                            {bankAccounts.length === 0 ? (
                                <p className="text-xs text-slate-500 dark:text-slate-400">No linked bank accounts. Map accounts in Settings.</p>
                            ) : (
                                bankAccounts.map((acc: any, i: number) => {
                                    const mask = acc.code ? `···${String(acc.code).slice(-4)}` : acc.account_type || '—';
                                    return (
                                        <div
                                            key={i}
                                            className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-700"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-[#0f172a] dark:text-white">{acc.name}</p>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400">{mask}</p>
                                            </div>
                                            <p className="shrink-0 font-mono text-sm font-bold text-[#0f172a] dark:text-white">
                                                {fmtMoney(parseFloat(acc.balance) || 0)}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate('/accounting/reports/daily')}
                            className="mt-4 w-full rounded-xl border-2 border-[#1e3a5f] bg-transparent py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1e3a5f] transition-colors hover:bg-slate-50 dark:border-sky-500 dark:text-sky-400 dark:hover:bg-slate-800"
                        >
                            View Reconciliation
                        </button>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                        <div className="mb-3 flex items-center gap-2">
                            {React.cloneElement(ICONS.list as React.ReactElement<any>, { width: 18, height: 18, className: 'text-slate-600 dark:text-slate-300' })}
                            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Ledger Account Balances</h3>
                        </div>
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-600 dark:text-slate-400">
                                    <th className="pb-2">Account</th>
                                    <th className="pb-2 text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono">
                                {ledgerRows.map((r) => (
                                    <tr key={r.name} className="border-b border-slate-100 dark:border-slate-800">
                                        <td className="py-2 pr-2 font-sans text-[11px] font-semibold text-slate-700 dark:text-slate-300">{r.name}</td>
                                        <td
                                            className={`py-2 text-right text-[11px] font-bold ${
                                                r.balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[#0f172a] dark:text-white'
                                            }`}
                                        >
                                            {r.balance < 0
                                                ? `(${CURRENCY} ${Math.abs(r.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                                                : fmtMoney(r.balance)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td className="pt-3 text-[11px] font-bold text-[#0f172a] dark:text-white">Total Assets</td>
                                    <td className="pt-3 text-right font-mono text-[11px] font-bold text-[#0f172a] dark:text-white">{fmtMoney(totalAssets)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>

            {/* Bottom banners + status */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-3 lg:col-span-2">
                    {totalCOGS > 0 && (
                        <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900/50 dark:bg-sky-950/30">
                            <div className="shrink-0 text-sky-600 dark:text-sky-400">
                                {React.cloneElement(ICONS.info as React.ReactElement<any>, { width: 22, height: 22 })}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-sky-950 dark:text-sky-100">Cost of Goods Sold</p>
                                <p className="text-xs leading-relaxed text-sky-900/90 dark:text-sky-200/90">
                                    Inventory valuation may be pending for the latest shipment batch. Profit margins shown are estimates when standard costs apply. Posted COGS:{' '}
                                    <span className="font-mono font-semibold">
                                        {CURRENCY} {totalCOGS.toLocaleString()}
                                    </span>
                                    .
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/25">
                        <div className="shrink-0 text-amber-600 dark:text-amber-400">
                            {React.cloneElement(ICONS.alertTriangle as React.ReactElement<any>, { width: 22, height: 22 })}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-amber-950 dark:text-amber-100">No Profit Data</p>
                            <p className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                                {netProfit <= 0 && totalRevenue === 0
                                    ? 'Projection data is limited until sales and ledger activity accumulate. Post journals and complete sales to populate margins.'
                                    : netProfit <= 0
                                      ? 'Net profit is zero or negative after expenses. Review the General Ledger and Financial Statements tabs.'
                                      : 'Supplemental projections (e.g. quarterly forecasts) are not synced from regional offices in this build; use Analytics for extended trends.'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-[#1e3a5f] p-5 text-white shadow-md dark:bg-slate-950">
                    <div className="absolute -right-6 -bottom-8 opacity-[0.07]">{React.cloneElement(ICONS.repeat as React.ReactElement<any>, { width: 120, height: 120 })}</div>
                    <div className="relative flex items-start gap-3">
                        <div className="rounded-lg bg-white/10 p-2">{zap}</div>
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">System Status</p>
                            <p className="mt-2 text-sm font-medium leading-relaxed text-white/95">
                                All financial streams are synced with the ledger. Next automated reconciliation window:{' '}
                                <span className="whitespace-nowrap font-mono text-xs">{nextUtcMidnight} UTC</span>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccountingDashboard;
