import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { shopApi, accountingApi } from '../services/shopApi';
import { getDashboardCache, setDashboardCache, type DashboardStats } from '../services/dashboardOfflineCache';
import { getTenantId } from '../services/posOfflineDb';
import Card from '../components/ui/Card';
import DailyReportSummaryPanel from '../components/shop/accounting/DailyReportSummaryPanel';
import { CURRENCY } from '../constants';
import {
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  AlertTriangle,
  DollarSign,
  Calendar,
  Smartphone,
  ArrowRight,
  LineChart,
} from 'lucide-react';
import { useShopTimezone } from '../context/ShopTimezoneContext';
import { lastNDayRangeIso, lastNMonthRangeIso } from '../utils/shopTimezone';
import { promiseWithTimeout } from '../utils/promiseTimeout';

const CACHE_READ_TIMEOUT_MS = 4_000;
const OVERVIEW_FETCH_TIMEOUT_MS = 45_000;

const DashboardCharts = lazy(() => import('../components/dashboard/DashboardCharts'));

type LowStockRow = { name: string; qty: string };
type PendingOrderRow = { id: string; orderNumber: string; customer: string };
type DashboardReportTab = 'daily' | 'weekly' | 'monthly' | 'yearly';
type TrendLabelMode = 'weekday' | 'shortDate';
type KpiCard = {
  label: string;
  value: string | number;
  icon: typeof Package;
  iconClass: string;
  isString?: boolean;
  sub?: string;
  warn?: boolean;
  mobileLink?: boolean;
};

function mergeDailyTrend(
  raw: unknown,
  dayKeys: string[],
  timeZone: string,
  labelMode: TrendLabelMode = 'weekday'
): { label: string; revenue: number }[] {
  const r = raw as { pos?: { day?: string; revenue?: string | number }[]; mobile?: { day?: string; revenue?: string | number }[] } | null;
  const pos = Array.isArray(r?.pos) ? r!.pos! : [];
  const mobile = Array.isArray(r?.mobile) ? r!.mobile! : [];
  const byDay = new Map<string, number>();
  for (const d of pos) {
    const key = String(d.day ?? '').slice(0, 10);
    if (!key) continue;
    byDay.set(key, (byDay.get(key) || 0) + (parseFloat(String(d.revenue)) || 0));
  }
  for (const d of mobile) {
    const key = String(d.day ?? '').slice(0, 10);
    if (!key) continue;
    byDay.set(key, (byDay.get(key) || 0) + (parseFloat(String(d.revenue)) || 0));
  }
  return dayKeys.map((key) => {
    const [y, m, day] = key.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, day, 12));
    const label =
      labelMode === 'shortDate'
        ? dt.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone })
        : dt.toLocaleDateString('en', { weekday: 'short', timeZone });
    return { label, revenue: Math.round((byDay.get(key) || 0) * 100) / 100 };
  });
}

function mergeMonthlyTrend(
  raw: unknown,
  monthKeys: string[],
  timeZone: string
): { label: string; revenue: number }[] {
  const r = raw as { pos?: { day?: string; revenue?: string | number }[]; mobile?: { day?: string; revenue?: string | number }[] } | null;
  const pos = Array.isArray(r?.pos) ? r!.pos! : [];
  const mobile = Array.isArray(r?.mobile) ? r!.mobile! : [];
  const byMonth = new Map<string, number>();
  for (const d of pos) {
    const key = String(d.day ?? '').slice(0, 7);
    if (!key) continue;
    byMonth.set(key, (byMonth.get(key) || 0) + (parseFloat(String(d.revenue)) || 0));
  }
  for (const d of mobile) {
    const key = String(d.day ?? '').slice(0, 7);
    if (!key) continue;
    byMonth.set(key, (byMonth.get(key) || 0) + (parseFloat(String(d.revenue)) || 0));
  }
  return monthKeys.map((key) => {
    const [y, mo] = key.split('-').map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, 1, 12));
    const label = dt.toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone });
    return { label, revenue: Math.round((byMonth.get(key) || 0) * 100) / 100 };
  });
}

type PeriodStats = { totalSales: number; totalRevenue: number; netRevenue: number };

function parsePeriodStatsFromSalesBySource(data: unknown): PeriodStats | null {
  if (!data || typeof data !== 'object') return null;
  const pos = (data as { pos?: Record<string, unknown> }).pos ?? {};
  const mobile = (data as { mobile?: Record<string, unknown> }).mobile ?? {};
  const posOrders = Number(pos.totalOrders) || 0;
  const mobileOrders = Number(mobile.totalOrders) || 0;
  const posGross = Number(pos.totalRevenue) || 0;
  const mobileGross = Number(mobile.totalRevenue) || 0;
  const posNet = Number(pos.netRevenue) || Math.max(0, posGross - (Number(pos.totalReturns) || 0));
  return {
    totalSales: posOrders + mobileOrders,
    totalRevenue: posGross + mobileGross,
    netRevenue: posNet + mobileGross,
  };
}

type TrendDayRow = { day?: string; order_count?: number | string; revenue?: number | string };

/** Sum order counts and revenue from daily-trend rows limited to `dayKeys`. POS rows are net of returns. */
function periodStatsFromTrendRaw(raw: unknown, dayKeys: string[]): PeriodStats {
  const r = raw as { pos?: TrendDayRow[]; mobile?: TrendDayRow[] } | null;
  const keySet = new Set(dayKeys);
  let totalSales = 0;
  let totalRevenue = 0;
  let netRevenue = 0;

  for (const d of r?.pos ?? []) {
    const key = String(d.day ?? '').slice(0, 10);
    if (!keySet.has(key)) continue;
    totalSales += Number(d.order_count) || 0;
    const rev = parseFloat(String(d.revenue)) || 0;
    totalRevenue += rev;
    netRevenue += rev;
  }
  for (const d of r?.mobile ?? []) {
    const key = String(d.day ?? '').slice(0, 10);
    if (!keySet.has(key)) continue;
    totalSales += Number(d.order_count) || 0;
    const rev = parseFloat(String(d.revenue)) || 0;
    totalRevenue += rev;
    netRevenue += rev;
  }

  return { totalSales, totalRevenue, netRevenue };
}

function resolvePeriodStats(
  salesBySource: unknown,
  trendRaw: unknown,
  dayKeys: string[]
): PeriodStats | null {
  return parsePeriodStatsFromSalesBySource(salesBySource) ?? periodStatsFromTrendRaw(trendRaw, dayKeys);
}

function buildPeriodKpiCards(
  stats: DashboardStats,
  profit: { totalProfit: number; avgProfitPerDay: number } | null,
  chartsLoaded: boolean,
  profitLabel: string,
  periodStats?: PeriodStats | null
): KpiCard[] {
  const periodReady = chartsLoaded && periodStats != null;
  const sales = periodStats?.totalSales;
  const gross = periodStats?.totalRevenue;
  const net = periodStats?.netRevenue;

  return [
    {
      label: 'Products',
      value: stats.totalProducts,
      icon: Package,
      iconClass: 'text-[#4A90E2]',
    },
    {
      label: 'Total Sales',
      value: periodReady ? sales! : chartsLoaded ? 0 : '—',
      icon: ShoppingCart,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Gross revenue',
      value: periodReady
        ? `${CURRENCY} ${gross!.toLocaleString()}`
        : chartsLoaded
          ? `${CURRENCY} 0`
          : '—',
      icon: TrendingUp,
      iconClass: 'text-violet-600 dark:text-violet-400',
      isString: true,
    },
    {
      label: 'Net sales',
      value: periodReady
        ? `${CURRENCY} ${net!.toLocaleString()}`
        : chartsLoaded
          ? `${CURRENCY} 0`
          : '—',
      icon: DollarSign,
      iconClass: 'text-emerald-700 dark:text-emerald-300',
      isString: true,
    },
    {
      label: profitLabel,
      value:
        profit != null
          ? `${CURRENCY} ${profit.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : '—',
      icon: LineChart,
      iconClass: 'text-teal-600 dark:text-teal-400',
      isString: true,
      sub:
        profit != null
          ? `Avg ${CURRENCY} ${profit.avgProfitPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 })}/day`
          : chartsLoaded
            ? 'No profit data'
            : 'Loading…',
    },
    {
      label: "Today's Sales",
      value: stats.todaySalesCount,
      icon: Calendar,
      iconClass: 'text-[#4A90E2]',
      sub: `${CURRENCY} ${stats.todayRevenue.toLocaleString()} today`,
    },
    {
      label: 'Loyalty members',
      value: stats.totalCustomers,
      icon: Users,
      iconClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Low Stock',
      value: stats.lowStockItems,
      icon: AlertTriangle,
      iconClass: 'text-amber-500',
      warn: true,
    },
    {
      label: 'Mobile Orders Pending',
      value: stats.mobileOrdersPending,
      icon: Smartphone,
      iconClass: 'text-[#4A90E2]',
      mobileLink: true,
    },
  ];
}

const EMPTY_STATS: DashboardStats = {
  totalProducts: 0,
  totalSales: 0,
  totalRevenue: 0,
  totalReturns: 0,
  netRevenue: 0,
  totalCustomers: 0,
  lowStockItems: 0,
  outOfStockItems: 0,
  branchesCount: 0,
  terminalsCount: 0,
  categoriesCount: 0,
  vendorsCount: 0,
  todaySalesCount: 0,
  todayRevenue: 0,
  avgOrderValue: 0,
  mobileOrdersPending: 0,
};

export default function DashboardPage() {
  const { timezone, loading: timezoneLoading } = useShopTimezone();
  const weeklyRange = useMemo(() => lastNDayRangeIso(7, timezone), [timezone]);
  const weeklyDayKeysKey = weeklyRange.dayKeys.join(',');
  const monthlyRange = useMemo(() => lastNDayRangeIso(30, timezone), [timezone]);
  const monthlyDayKeysKey = monthlyRange.dayKeys.join(',');
  const yearlyKpiRange = useMemo(() => lastNDayRangeIso(365, timezone), [timezone]);
  const yearlyKpiDayKeysKey = yearlyKpiRange.dayKeys.join(',');
  const yearlyChartRange = useMemo(() => lastNMonthRangeIso(12, timezone), [timezone]);
  const yearlyMonthKeysKey = yearlyChartRange.monthKeys.join(',');
  const loadGenRef = useRef(0);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [ready, setReady] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [lowStockRows, setLowStockRows] = useState<LowStockRow[]>([]);
  const [pendingOrderRows, setPendingOrderRows] = useState<PendingOrderRow[]>([]);
  const [salesTrend, setSalesTrend] = useState<{ label: string; revenue: number }[]>([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [chartsLoaded, setChartsLoaded] = useState(false);
  const [profit7d, setProfit7d] = useState<{ totalProfit: number; avgProfitPerDay: number } | null>(null);
  const [weeklyPeriodStats, setWeeklyPeriodStats] = useState<PeriodStats | null>(null);
  const [monthlySalesTrend, setMonthlySalesTrend] = useState<{ label: string; revenue: number }[]>([]);
  const [monthlyRevenueBreakdown, setMonthlyRevenueBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [profit30d, setProfit30d] = useState<{ totalProfit: number; avgProfitPerDay: number } | null>(null);
  const [monthlyPeriodStats, setMonthlyPeriodStats] = useState<{
    totalSales: number;
    totalRevenue: number;
    netRevenue: number;
  } | null>(null);
  const [monthlyChartsLoaded, setMonthlyChartsLoaded] = useState(false);
  const [yearlySalesTrend, setYearlySalesTrend] = useState<{ label: string; revenue: number }[]>([]);
  const [yearlyRevenueBreakdown, setYearlyRevenueBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [profit365d, setProfit365d] = useState<{ totalProfit: number; avgProfitPerDay: number } | null>(null);
  const [yearlyPeriodStats, setYearlyPeriodStats] = useState<{
    totalSales: number;
    totalRevenue: number;
    netRevenue: number;
  } | null>(null);
  const [yearlyChartsLoaded, setYearlyChartsLoaded] = useState(false);
  const [activeReport, setActiveReport] = useState<DashboardReportTab>('daily');

  useEffect(() => {
    const gen = loadGenRef.current + 1;
    loadGenRef.current = gen;
    let cancelled = false;
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    async function loadCharts() {
      if (!isOnline || !tenantId || timezoneLoading) return;
      try {
        const [
          trendRaw,
          categoryPerf,
          profitSummary,
          sales7,
          monthlyTrendRaw,
          monthlyCategoryPerf,
          profit30Summary,
          sales30,
          yearlyTrendRaw,
          yearlyCategoryPerf,
          profit365Summary,
          sales365,
        ] = await Promise.all([
          accountingApi.getDailyTrend({ from: weeklyRange.fromIso, to: weeklyRange.toIso }).catch(() => null),
          accountingApi.getCategoryPerformance(weeklyRange.fromIso, weeklyRange.categoryToIso).catch(() => []),
          accountingApi.dailyProfitSummary(weeklyRange.dayKeys).catch(() => null),
          accountingApi.getSalesBySource(weeklyRange.fromIso, weeklyRange.toIso).catch(() => null),
          accountingApi.getDailyTrend({ from: monthlyRange.fromIso, to: monthlyRange.toIso }).catch(() => null),
          accountingApi.getCategoryPerformance(monthlyRange.fromIso, monthlyRange.categoryToIso).catch(() => []),
          accountingApi.dailyProfitSummary(monthlyRange.dayKeys).catch(() => null),
          accountingApi.getSalesBySource(monthlyRange.fromIso, monthlyRange.toIso).catch(() => null),
          accountingApi.getDailyTrend({ from: yearlyChartRange.fromIso, to: yearlyChartRange.toIso }).catch(() => null),
          accountingApi.getCategoryPerformance(yearlyChartRange.fromIso, yearlyChartRange.categoryToIso).catch(() => []),
          accountingApi.dailyProfitRange(yearlyKpiRange.fromIso, yearlyKpiRange.toIso).catch(() => null),
          accountingApi.getSalesBySource(yearlyKpiRange.fromIso, yearlyKpiRange.toIso).catch(() => null),
        ]);
        if (cancelled || loadGenRef.current !== gen) return;
        setSalesTrend(mergeDailyTrend(trendRaw, weeklyRange.dayKeys, timezone));
        const catArr = Array.isArray(categoryPerf) ? categoryPerf : [];
        setRevenueBreakdown(
          catArr
            .map((c: { category?: string; revenue?: string | number }) => ({
              name: String(c.category ?? 'Uncategorized'),
              value: Math.max(0, parseFloat(String(c.revenue)) || 0),
            }))
            .filter((x) => x.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 7)
        );
        if (profitSummary && typeof profitSummary === 'object') {
          setProfit7d({
            totalProfit: Number(profitSummary.totalProfit) || 0,
            avgProfitPerDay: Number(profitSummary.avgProfitPerDay) || 0,
          });
        } else {
          setProfit7d(null);
        }
        setWeeklyPeriodStats(resolvePeriodStats(sales7, trendRaw, weeklyRange.dayKeys));
        setChartsLoaded(true);

        setMonthlySalesTrend(
          mergeDailyTrend(monthlyTrendRaw, monthlyRange.dayKeys, timezone, 'shortDate')
        );
        const monthlyCatArr = Array.isArray(monthlyCategoryPerf) ? monthlyCategoryPerf : [];
        setMonthlyRevenueBreakdown(
          monthlyCatArr
            .map((c: { category?: string; revenue?: string | number }) => ({
              name: String(c.category ?? 'Uncategorized'),
              value: Math.max(0, parseFloat(String(c.revenue)) || 0),
            }))
            .filter((x) => x.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 7)
        );
        if (profit30Summary && typeof profit30Summary === 'object') {
          setProfit30d({
            totalProfit: Number(profit30Summary.totalProfit) || 0,
            avgProfitPerDay: Number(profit30Summary.avgProfitPerDay) || 0,
          });
        } else {
          setProfit30d(null);
        }
        setMonthlyPeriodStats(resolvePeriodStats(sales30, monthlyTrendRaw, monthlyRange.dayKeys));
        setMonthlyChartsLoaded(true);

        setYearlySalesTrend(mergeMonthlyTrend(yearlyTrendRaw, yearlyChartRange.monthKeys, timezone));
        const yearlyCatArr = Array.isArray(yearlyCategoryPerf) ? yearlyCategoryPerf : [];
        setYearlyRevenueBreakdown(
          yearlyCatArr
            .map((c: { category?: string; revenue?: string | number }) => ({
              name: String(c.category ?? 'Uncategorized'),
              value: Math.max(0, parseFloat(String(c.revenue)) || 0),
            }))
            .filter((x) => x.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 7)
        );
        if (profit365Summary && typeof profit365Summary === 'object') {
          setProfit365d({
            totalProfit: Number(profit365Summary.totalProfit) || 0,
            avgProfitPerDay: Number(profit365Summary.avgProfitPerDay) || 0,
          });
        } else {
          setProfit365d(null);
        }
        setYearlyPeriodStats(parsePeriodStatsFromSalesBySource(sales365));
        setYearlyChartsLoaded(true);
      } catch {
        if (!cancelled) {
          setChartsLoaded(false);
          setProfit7d(null);
          setWeeklyPeriodStats(null);
          setMonthlyChartsLoaded(false);
          setProfit30d(null);
          setMonthlyPeriodStats(null);
          setYearlyChartsLoaded(false);
          setProfit365d(null);
          setYearlyPeriodStats(null);
        }
      }
    }

    async function load() {
      try {
        if (tenantId) {
          const cached = await promiseWithTimeout(
            getDashboardCache(tenantId),
            CACHE_READ_TIMEOUT_MS,
            null
          );
          if (cancelled) return;
          if (cached?.stats) {
            setStats(cached.stats);
            setCachedAt(cached.cachedAt || null);
          }
        }
      } catch {
        /* IndexedDB unavailable or blocked — continue with empty/cached UI */
      }

      if (!cancelled && loadGenRef.current === gen) setReady(true);

      if (!isOnline || !tenantId || timezoneLoading) {
        if (!cancelled && loadGenRef.current === gen) {
          setChartsLoaded(false);
          setProfit7d(null);
          setWeeklyPeriodStats(null);
          setMonthlyChartsLoaded(false);
          setProfit30d(null);
          setMonthlyPeriodStats(null);
          setYearlyChartsLoaded(false);
          setProfit365d(null);
          setYearlyPeriodStats(null);
        }
        return;
      }

      loadCharts();

      try {
        const overview = await promiseWithTimeout(
          shopApi.getDashboardOverview(),
          OVERVIEW_FETCH_TIMEOUT_MS,
          null
        );
        if (cancelled || loadGenRef.current !== gen || !overview) return;
        setStats(overview.stats);
        setLowStockRows(overview.lowStockRows);
        setPendingOrderRows(overview.pendingOrders);
        setCachedAt(null);
        await setDashboardCache(tenantId, overview.stats).catch(() => {});
      } catch (err) {
        console.error('Failed to load dashboard:', err);
        if (!cancelled && tenantId) {
          try {
            const cached = await promiseWithTimeout(
              getDashboardCache(tenantId),
              CACHE_READ_TIMEOUT_MS,
              null
            );
            if (cached?.stats) {
              setStats(cached.stats);
              setCachedAt(cached.cachedAt || null);
            }
          } catch {
            setCachedAt(null);
          }
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [timezone, weeklyDayKeysKey, monthlyDayKeysKey, yearlyKpiDayKeysKey, yearlyMonthKeysKey, timezoneLoading]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  const weeklyKpiCards = useMemo(
    () => buildPeriodKpiCards(stats, profit7d, chartsLoaded, '7-day profit', weeklyPeriodStats),
    [stats, profit7d, chartsLoaded, weeklyPeriodStats]
  );

  const monthlyKpiCards = useMemo(
    () =>
      buildPeriodKpiCards(
        stats,
        profit30d,
        monthlyChartsLoaded,
        '30-day profit',
        monthlyPeriodStats
      ),
    [stats, profit30d, monthlyChartsLoaded, monthlyPeriodStats]
  );

  const yearlyKpiCards = useMemo(
    () =>
      buildPeriodKpiCards(
        stats,
        profit365d,
        yearlyChartsLoaded,
        '365-day profit',
        yearlyPeriodStats
      ),
    [stats, profit365d, yearlyChartsLoaded, yearlyPeriodStats]
  );

  if (!ready) {
    return (
      <div className="-mx-4 h-full min-h-0 bg-[#F8F9FA] px-4 py-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 dark:bg-background">
        <div className="space-y-8">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-40 animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 flex h-full min-h-0 flex-col overflow-hidden bg-[#F8F9FA] px-4 py-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 dark:bg-background">
      <div className="shrink-0 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#212529] dark:text-foreground">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#6C757D] dark:text-muted-foreground">
              Daily accounting totals at the top, then catalog-wide KPIs, trends, and alerts.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#6C757D] shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <Calendar className="h-4 w-4 shrink-0 text-[#4A90E2]" strokeWidth={2} aria-hidden />
              <span className="tabular-nums">{todayLabel}</span>
            </span>
          </div>
        </div>

        {cachedAt && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            Offline — showing cached data. Last updated: {new Date(cachedAt).toLocaleString()}
          </div>
        )}
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-gray-200 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-card sm:p-4">
        <div className="shrink-0 border-b border-gray-100 pb-3 dark:border-gray-700">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: 'daily', label: 'Daily report' },
              { id: 'weekly', label: 'Weekly report' },
              { id: 'monthly', label: 'Monthly report' },
              { id: 'yearly', label: 'Yearly report' },
            ] as const).map((tab) => {
              const active = activeReport === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveReport(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#4A90E2]/15 text-[#1e4f82] dark:bg-[#4A90E2]/20 dark:text-[#9bc5f0]'
                      : 'text-[#6C757D] hover:bg-gray-100 hover:text-[#212529] dark:text-muted-foreground dark:hover:bg-slate-800 dark:hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="custom-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {activeReport === 'daily' && (
        <section id="daily-report" className="scroll-mt-6 space-y-3" aria-labelledby="daily-report-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="daily-report-heading" className="text-lg font-semibold text-[#212529] dark:text-foreground">
              Daily report
            </h2>
            <p className="text-xs text-[#6C757D] dark:text-muted-foreground">
              POS, mobile, inventory movement, vendor payments, expenses, khata, and net profit for the date you select.
            </p>
          </div>
          <div className="rounded-[10px] border border-gray-200 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-card sm:p-4">
            <DailyReportSummaryPanel />
          </div>
        </section>
        )}

        {activeReport === 'weekly' && (
        <section id="business-overview" className="scroll-mt-6 space-y-4" aria-labelledby="overview-heading">
          <div>
            <h2 id="overview-heading" className="text-lg font-semibold text-[#212529] dark:text-foreground">
              Weekly report
            </h2>
            <p className="mt-0.5 text-sm text-[#6C757D] dark:text-muted-foreground">
              Weekly KPIs and charts with operational alerts.
            </p>
          </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {weeklyKpiCards.map((card) => (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-[10px] border border-gray-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-card dark:shadow-none"
            >
              <p className="pr-10 text-xs font-medium text-[#6C757D] dark:text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#212529] dark:text-foreground">
                {card.isString
                  ? card.value
                  : typeof card.value === 'number'
                    ? card.value.toLocaleString()
                    : card.value}
              </p>
              {'sub' in card && card.sub && <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">{card.sub}</p>}
              {card.mobileLink && stats.mobileOrdersPending > 0 && (
                <Link
                  to="/order-center"
                  className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-[#4A90E2] hover:underline"
                >
                  (View orders <ArrowRight className="inline h-3 w-3" />)
                </Link>
              )}
              <div className={`absolute right-3 top-3 ${card.iconClass}`}>
                <card.icon className="h-5 w-5 opacity-90" strokeWidth={2} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_min(100%,320px)] xl:items-start">
          <Suspense
            fallback={
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="h-[320px] animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />
                <div className="h-[320px] animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />
              </div>
            }
          >
            <DashboardCharts
              chartsLoaded={chartsLoaded}
              cachedAt={cachedAt}
              salesTrend={salesTrend}
              revenueBreakdown={revenueBreakdown}
            />
          </Suspense>

          <Card
            className="border border-gray-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none xl:sticky xl:top-4"
            padding="none"
          >
            <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">Alerts</h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="overflow-hidden rounded-lg border border-amber-200/80 dark:border-amber-800/60">
                <div className="bg-[#F6C23E] px-3 py-2 text-sm font-semibold text-gray-900">Low Stock</div>
                <div className="bg-[#FFF3CD] p-3 dark:bg-amber-950/30">
                  {lowStockRows.length === 0 ? (
                    <p className="text-sm text-gray-700 dark:text-gray-300">No low stock items.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                          <th className="pb-2 pr-2">Item</th>
                          <th className="pb-2 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-800 dark:text-gray-200">
                        {lowStockRows.map((row, idx) => (
                          <tr key={`${row.name}-${idx}`} className="border-t border-amber-200/60 dark:border-amber-800/40">
                            <td className="py-1.5 pr-2">{row.name}</td>
                            <td className="py-1.5 text-right tabular-nums">{row.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Link
                    to="/inventory"
                    className="mt-2 inline-block text-xs font-medium text-[#4A90E2] hover:underline"
                  >
                    Open inventory
                  </Link>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-red-200/80 dark:border-red-900/50">
                <div className="bg-[#E74A3B] px-3 py-2 text-sm font-semibold text-white">Pending Orders</div>
                <div className="bg-[#F8D7DA] p-3 dark:bg-red-950/25">
                  {pendingOrderRows.length === 0 ? (
                    <p className="text-sm text-gray-800 dark:text-gray-200">No pending mobile orders.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-400">
                          <th className="pb-2 pr-2">Order #</th>
                          <th className="pb-2">Customer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingOrderRows.map((row) => (
                          <tr key={row.id} className="border-t border-red-200/60 dark:border-red-900/40">
                            <td className="py-1.5 pr-2">
                              <Link
                                to={`/order-center?order=${encodeURIComponent(row.id)}&kind=cart`}
                                className="font-medium text-[#4A90E2] hover:underline"
                              >
                                {row.orderNumber}
                              </Link>
                            </td>
                            <td className="py-1.5 text-gray-800 dark:text-gray-200">{row.customer}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Link
                    to="/order-center"
                    className="mt-2 inline-block text-xs font-medium text-[#4A90E2] hover:underline"
                  >
                    View all mobile orders
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </div>
        </section>
        )}

        {activeReport === 'monthly' && (
        <section id="monthly-overview" className="scroll-mt-6 space-y-4" aria-labelledby="monthly-overview-heading">
          <div>
            <h2 id="monthly-overview-heading" className="text-lg font-semibold text-[#212529] dark:text-foreground">
              Monthly report
            </h2>
            <p className="mt-0.5 text-sm text-[#6C757D] dark:text-muted-foreground">
              Last 30 days — KPIs, trends, and operational alerts.
            </p>
          </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {monthlyKpiCards.map((card) => (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-[10px] border border-gray-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-card dark:shadow-none"
            >
              <p className="pr-10 text-xs font-medium text-[#6C757D] dark:text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#212529] dark:text-foreground">
                {card.isString
                  ? card.value
                  : typeof card.value === 'number'
                    ? card.value.toLocaleString()
                    : card.value}
              </p>
              {'sub' in card && card.sub && <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">{card.sub}</p>}
              {card.mobileLink && stats.mobileOrdersPending > 0 && (
                <Link
                  to="/order-center"
                  className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-[#4A90E2] hover:underline"
                >
                  (View orders <ArrowRight className="inline h-3 w-3" />)
                </Link>
              )}
              <div className={`absolute right-3 top-3 ${card.iconClass}`}>
                <card.icon className="h-5 w-5 opacity-90" strokeWidth={2} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_min(100%,320px)] xl:items-start">
          <Suspense
            fallback={
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="h-[320px] animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />
                <div className="h-[320px] animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />
              </div>
            }
          >
            <DashboardCharts
              chartsLoaded={monthlyChartsLoaded}
              cachedAt={cachedAt}
              salesTrend={monthlySalesTrend}
              revenueBreakdown={monthlyRevenueBreakdown}
              trendTitle="Daily Sales Trends"
              trendSubtitle="Last 30 days (POS + mobile)"
            />
          </Suspense>

          <Card
            className="border border-gray-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none xl:sticky xl:top-4"
            padding="none"
          >
            <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">Alerts</h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="overflow-hidden rounded-lg border border-amber-200/80 dark:border-amber-800/60">
                <div className="bg-[#F6C23E] px-3 py-2 text-sm font-semibold text-gray-900">Low Stock</div>
                <div className="bg-[#FFF3CD] p-3 dark:bg-amber-950/30">
                  {lowStockRows.length === 0 ? (
                    <p className="text-sm text-gray-700 dark:text-gray-300">No low stock items.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                          <th className="pb-2 pr-2">Item</th>
                          <th className="pb-2 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-800 dark:text-gray-200">
                        {lowStockRows.map((row, idx) => (
                          <tr key={`${row.name}-${idx}`} className="border-t border-amber-200/60 dark:border-amber-800/40">
                            <td className="py-1.5 pr-2">{row.name}</td>
                            <td className="py-1.5 text-right tabular-nums">{row.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Link
                    to="/inventory"
                    className="mt-2 inline-block text-xs font-medium text-[#4A90E2] hover:underline"
                  >
                    Open inventory
                  </Link>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-red-200/80 dark:border-red-900/50">
                <div className="bg-[#E74A3B] px-3 py-2 text-sm font-semibold text-white">Pending Orders</div>
                <div className="bg-[#F8D7DA] p-3 dark:bg-red-950/25">
                  {pendingOrderRows.length === 0 ? (
                    <p className="text-sm text-gray-800 dark:text-gray-200">No pending mobile orders.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-400">
                          <th className="pb-2 pr-2">Order #</th>
                          <th className="pb-2">Customer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingOrderRows.map((row) => (
                          <tr key={row.id} className="border-t border-red-200/60 dark:border-red-900/40">
                            <td className="py-1.5 pr-2">
                              <Link
                                to={`/order-center?order=${encodeURIComponent(row.id)}&kind=cart`}
                                className="font-medium text-[#4A90E2] hover:underline"
                              >
                                {row.orderNumber}
                              </Link>
                            </td>
                            <td className="py-1.5 text-gray-800 dark:text-gray-200">{row.customer}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Link
                    to="/order-center"
                    className="mt-2 inline-block text-xs font-medium text-[#4A90E2] hover:underline"
                  >
                    View all mobile orders
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </div>
        </section>
        )}

        {activeReport === 'yearly' && (
        <section id="yearly-overview" className="scroll-mt-6 space-y-4" aria-labelledby="yearly-overview-heading">
          <div>
            <h2 id="yearly-overview-heading" className="text-lg font-semibold text-[#212529] dark:text-foreground">
              Yearly report
            </h2>
            <p className="mt-0.5 text-sm text-[#6C757D] dark:text-muted-foreground">
              Last 365 days — KPIs and operational alerts. Monthly revenue trend covers the last 12 months.
            </p>
          </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {yearlyKpiCards.map((card) => (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-[10px] border border-gray-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-card dark:shadow-none"
            >
              <p className="pr-10 text-xs font-medium text-[#6C757D] dark:text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#212529] dark:text-foreground">
                {card.isString
                  ? card.value
                  : typeof card.value === 'number'
                    ? card.value.toLocaleString()
                    : card.value}
              </p>
              {'sub' in card && card.sub && <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">{card.sub}</p>}
              {card.mobileLink && stats.mobileOrdersPending > 0 && (
                <Link
                  to="/order-center"
                  className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-[#4A90E2] hover:underline"
                >
                  (View orders <ArrowRight className="inline h-3 w-3" />)
                </Link>
              )}
              <div className={`absolute right-3 top-3 ${card.iconClass}`}>
                <card.icon className="h-5 w-5 opacity-90" strokeWidth={2} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_min(100%,320px)] xl:items-start">
          <Suspense
            fallback={
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="h-[320px] animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />
                <div className="h-[320px] animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />
              </div>
            }
          >
            <DashboardCharts
              chartsLoaded={yearlyChartsLoaded}
              cachedAt={cachedAt}
              salesTrend={yearlySalesTrend}
              revenueBreakdown={yearlyRevenueBreakdown}
              trendTitle="Monthly Sales Trends"
              trendSubtitle="Last 12 months (POS + mobile)"
              trendTickInterval={0}
            />
          </Suspense>

          <Card
            className="border border-gray-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none xl:sticky xl:top-4"
            padding="none"
          >
            <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">Alerts</h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="overflow-hidden rounded-lg border border-amber-200/80 dark:border-amber-800/60">
                <div className="bg-[#F6C23E] px-3 py-2 text-sm font-semibold text-gray-900">Low Stock</div>
                <div className="bg-[#FFF3CD] p-3 dark:bg-amber-950/30">
                  {lowStockRows.length === 0 ? (
                    <p className="text-sm text-gray-700 dark:text-gray-300">No low stock items.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                          <th className="pb-2 pr-2">Item</th>
                          <th className="pb-2 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-800 dark:text-gray-200">
                        {lowStockRows.map((row, idx) => (
                          <tr key={`${row.name}-${idx}`} className="border-t border-amber-200/60 dark:border-amber-800/40">
                            <td className="py-1.5 pr-2">{row.name}</td>
                            <td className="py-1.5 text-right tabular-nums">{row.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Link
                    to="/inventory"
                    className="mt-2 inline-block text-xs font-medium text-[#4A90E2] hover:underline"
                  >
                    Open inventory
                  </Link>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-red-200/80 dark:border-red-900/50">
                <div className="bg-[#E74A3B] px-3 py-2 text-sm font-semibold text-white">Pending Orders</div>
                <div className="bg-[#F8D7DA] p-3 dark:bg-red-950/25">
                  {pendingOrderRows.length === 0 ? (
                    <p className="text-sm text-gray-800 dark:text-gray-200">No pending mobile orders.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-400">
                          <th className="pb-2 pr-2">Order #</th>
                          <th className="pb-2">Customer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingOrderRows.map((row) => (
                          <tr key={row.id} className="border-t border-red-200/60 dark:border-red-900/40">
                            <td className="py-1.5 pr-2">
                              <Link
                                to={`/order-center?order=${encodeURIComponent(row.id)}&kind=cart`}
                                className="font-medium text-[#4A90E2] hover:underline"
                              >
                                {row.orderNumber}
                              </Link>
                            </td>
                            <td className="py-1.5 text-gray-800 dark:text-gray-200">{row.customer}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Link
                    to="/order-center"
                    className="mt-2 inline-block text-xs font-medium text-[#4A90E2] hover:underline"
                  >
                    View all mobile orders
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </div>
        </section>
        )}
        </div>
      </div>
    </div>
  );
}
