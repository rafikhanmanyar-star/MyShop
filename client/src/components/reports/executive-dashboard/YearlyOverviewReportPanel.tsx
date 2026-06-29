import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  DollarSign,
  LineChart,
  Package,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { accountingApi, shopApi } from '../../../services/shopApi';
import type { DashboardStats } from '../../../services/dashboardOfflineCache';
import { CURRENCY } from '../../../constants';
import { useShopTimezone } from '../../../context/ShopTimezoneContext';
import { yearToDateRangeIso, yearToDateMonthRangeIso } from '../../../utils/shopTimezone';
import StatCard from '../../dashboard/StatCard';
import Card from '../../ui/Card';
import AssetVelocityPanel from '../../dashboard/AssetVelocityPanel';
import type { InventoryValuePoint } from '../../dashboard/InventoryValueChart';

const DashboardCharts = lazy(() => import('../../dashboard/DashboardCharts'));
const InventoryValueChart = lazy(() => import('../../dashboard/InventoryValueChart'));

type InventoryTrendRaw = {
  days: { day: string; costValue: number; retailValue: number }[];
  costNow: number;
  retailNow: number;
  costStart: number;
  retailStart: number;
} | null;

type InventoryTrend = {
  points: InventoryValuePoint[];
  costNow: number;
  retailNow: number;
  costStart: number;
  retailStart: number;
} | null;

type PeriodStats = { totalSales: number; totalRevenue: number; netRevenue: number };

type KpiCard = {
  label: string;
  value: string | number;
  icon: typeof Package;
  iconClass: string;
  accentClass?: string;
  isString?: boolean;
  sub?: string;
  warn?: boolean;
  mobileLink?: boolean;
  delta?: number;
};

type LowStockRow = { name: string; qty: string };
type PendingOrderRow = { id: string; orderNumber: string; customer: string };

function pctChange(start: number, now: number): number | undefined {
  if (!start || start === 0) return undefined;
  return ((now - start) / start) * 100;
}

function buildInventoryMonthlyPoints(raw: InventoryTrendRaw, timeZone: string): InventoryValuePoint[] {
  const byMonth = new Map<string, { day: string; costValue: number; retailValue: number }>();
  for (const d of raw?.days ?? []) {
    const dayStr = String(d.day).slice(0, 10);
    const key = dayStr.slice(0, 7);
    const existing = byMonth.get(key);
    if (!existing || dayStr > existing.day) {
      byMonth.set(key, {
        day: dayStr,
        costValue: Number(d.costValue) || 0,
        retailValue: Number(d.retailValue) || 0,
      });
    }
  }
  return [...byMonth.keys()].sort().map((key) => {
    const [y, mo] = key.split('-').map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, 1, 12));
    const v = byMonth.get(key)!;
    return {
      label: dt.toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone }),
      costValue: Math.round(v.costValue * 100) / 100,
      retailValue: Math.round(v.retailValue * 100) / 100,
    };
  });
}

function buildInventoryTrend(raw: InventoryTrendRaw, points: InventoryValuePoint[]): InventoryTrend {
  if (!raw) return null;
  return {
    points,
    costNow: Number(raw.costNow) || 0,
    retailNow: Number(raw.retailNow) || 0,
    costStart: Number(raw.costStart) || 0,
    retailStart: Number(raw.retailStart) || 0,
  };
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

function inventoryKpiCards(inventory: InventoryTrend, loaded: boolean): KpiCard[] {
  const ready = inventory != null;
  return [
    {
      label: 'Inventory purchase value',
      value: ready
        ? `${CURRENCY} ${inventory!.costNow.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : loaded
          ? `${CURRENCY} 0`
          : '—',
      icon: Wallet,
      iconClass: 'text-indigo-600 dark:text-indigo-400',
      accentClass: 'bg-indigo-500',
      isString: true,
      delta: ready ? pctChange(inventory!.costStart, inventory!.costNow) : undefined,
      sub: 'Total stock at cost',
    },
    {
      label: 'Inventory selling value',
      value: ready
        ? `${CURRENCY} ${inventory!.retailNow.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : loaded
          ? `${CURRENCY} 0`
          : '—',
      icon: Package,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      accentClass: 'bg-emerald-500',
      isString: true,
      delta: ready ? pctChange(inventory!.retailStart, inventory!.retailNow) : undefined,
      sub: 'Total stock at retail',
    },
  ];
}

function buildPeriodKpiCards(
  stats: DashboardStats,
  profit: { totalProfit: number; avgProfitPerDay: number } | null,
  chartsLoaded: boolean,
  periodStats?: PeriodStats | null,
  inventory?: InventoryTrend
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
      accentClass: 'bg-sky-500',
    },
    {
      label: 'Total Sales',
      value: periodReady ? sales! : chartsLoaded ? 0 : '—',
      icon: ShoppingCart,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      accentClass: 'bg-emerald-500',
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
      accentClass: 'bg-violet-500',
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
      accentClass: 'bg-emerald-600',
      isString: true,
    },
    {
      label: 'Year-to-date profit',
      value:
        profit != null
          ? `${CURRENCY} ${profit.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : '—',
      icon: LineChart,
      iconClass: 'text-teal-600 dark:text-teal-400',
      accentClass: 'bg-teal-500',
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
      accentClass: 'bg-sky-500',
      sub: `${CURRENCY} ${stats.todayRevenue.toLocaleString()} today`,
    },
    {
      label: 'Loyalty members',
      value: stats.totalCustomers,
      icon: Users,
      iconClass: 'text-amber-600 dark:text-amber-400',
      accentClass: 'bg-amber-500',
    },
    {
      label: 'Low Stock',
      value: stats.lowStockItems,
      icon: AlertTriangle,
      iconClass: 'text-amber-500',
      accentClass: 'bg-rose-500',
      warn: true,
    },
    {
      label: 'Mobile Orders Pending',
      value: stats.mobileOrdersPending,
      icon: Smartphone,
      iconClass: 'text-[#4A90E2]',
      accentClass: 'bg-blue-500',
      mobileLink: true,
    },
    ...inventoryKpiCards(inventory ?? null, chartsLoaded),
  ];
}

function KpiCardTile({ card, mobileOrdersPending }: { card: KpiCard; mobileOrdersPending: number }) {
  const navigate = useNavigate();
  const displayValue = card.isString
    ? card.value
    : typeof card.value === 'number'
      ? card.value.toLocaleString()
      : card.value;
  const sub =
    card.mobileLink && mobileOrdersPending > 0 ? (
      <Link to="/order-center" className="inline-flex items-center gap-0.5 font-semibold text-[#0047AB] dark:text-blue-300">
        View orders →
      </Link>
    ) : (
      card.sub
    );
  return (
    <StatCard
      label={card.label}
      value={displayValue}
      sub={sub}
      delta={card.delta}
      icon={card.icon}
      iconClass={card.iconClass}
      accentClass={card.accentClass ?? (card.warn ? 'bg-amber-500' : 'bg-[#4A90E2]')}
      onClick={card.mobileLink ? () => navigate('/order-center') : undefined}
    />
  );
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

/** Year-to-date overview — loaded on demand when opened from Reports (not on main dashboard). */
const YearlyOverviewReportPanel: React.FC = () => {
  const { timezone, loading: timezoneLoading } = useShopTimezone();
  const yearlyKpiRange = useMemo(() => yearToDateRangeIso(timezone), [timezone]);
  const yearlyChartRange = useMemo(() => yearToDateMonthRangeIso(timezone), [timezone]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [lowStockRows, setLowStockRows] = useState<LowStockRow[]>([]);
  const [pendingOrderRows, setPendingOrderRows] = useState<PendingOrderRow[]>([]);
  const [salesTrend, setSalesTrend] = useState<{ label: string; revenue: number }[]>([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [profit365d, setProfit365d] = useState<{ totalProfit: number; avgProfitPerDay: number } | null>(null);
  const [periodStats, setPeriodStats] = useState<PeriodStats | null>(null);
  const [inventory, setInventory] = useState<InventoryTrend>(null);
  const [chartsLoaded, setChartsLoaded] = useState(false);

  useEffect(() => {
    if (timezoneLoading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setChartsLoaded(false);
      try {
        const [
          overview,
          yearlyTrendRaw,
          yearlyCategoryPerf,
          profit365Summary,
          sales365,
          yearlyInventoryRaw,
        ] = await Promise.all([
          shopApi.getDashboardOverview().catch(() => null),
          accountingApi.getDailyTrend({ from: yearlyChartRange.fromIso, to: yearlyChartRange.toIso }).catch(() => null),
          accountingApi.getCategoryPerformance(yearlyChartRange.fromIso, yearlyChartRange.categoryToIso).catch(() => []),
          accountingApi.dailyProfitRange(yearlyKpiRange.fromIso, yearlyKpiRange.toIso).catch(() => null),
          accountingApi.getSalesBySource(yearlyKpiRange.fromIso, yearlyKpiRange.toIso).catch(() => null),
          accountingApi.getInventoryValueTrend(yearlyChartRange.fromIso, yearlyChartRange.toIso).catch(() => null),
        ]);

        if (cancelled) return;

        if (overview?.stats) {
          setStats(overview.stats);
          setLowStockRows(overview.lowStockRows ?? []);
          setPendingOrderRows(overview.pendingOrders ?? []);
        }

        setSalesTrend(mergeMonthlyTrend(yearlyTrendRaw, yearlyChartRange.monthKeys, timezone));
        const catArr = Array.isArray(yearlyCategoryPerf) ? yearlyCategoryPerf : [];
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

        if (profit365Summary && typeof profit365Summary === 'object') {
          setProfit365d({
            totalProfit: Number(profit365Summary.totalProfit) || 0,
            avgProfitPerDay: Number(profit365Summary.avgProfitPerDay) || 0,
          });
        } else {
          setProfit365d(null);
        }

        setPeriodStats(parsePeriodStatsFromSalesBySource(sales365));
        setInventory(
          buildInventoryTrend(
            yearlyInventoryRaw as InventoryTrendRaw,
            buildInventoryMonthlyPoints(yearlyInventoryRaw as InventoryTrendRaw, timezone)
          )
        );
        setChartsLoaded(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load year-to-date report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [timezone, timezoneLoading, yearlyKpiRange.fromIso, yearlyKpiRange.toIso, yearlyChartRange.fromIso, yearlyChartRange.toIso, yearlyChartRange.monthKeys, yearlyChartRange.categoryToIso]);

  const kpiCards = useMemo(
    () => buildPeriodKpiCards(stats, profit365d, chartsLoaded, periodStats, inventory),
    [stats, profit365d, chartsLoaded, periodStats, inventory]
  );

  if (loading && !chartsLoaded) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
        <div className="h-[320px] animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border border-rose-200 bg-rose-50 p-6 dark:border-rose-800 dark:bg-rose-950/40">
        <p className="font-semibold text-rose-900 dark:text-rose-200">Could not load year-to-date report</p>
        <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-100">Year to date overview</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          KPIs, monthly revenue trend, inventory valuation, and operational alerts for the current calendar year.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpiCards.map((card) => (
          <KpiCardTile key={card.label} card={card} mobileOrdersPending={stats.mobileOrdersPending} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr] xl:items-stretch">
        <Suspense fallback={<div className="h-[320px] animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />}>
          <InventoryValueChart
            chartsLoaded={chartsLoaded}
            cachedAt={null}
            data={inventory?.points ?? []}
            subtitle="Total purchase (cost) vs. selling (retail) value — year to date (monthly)"
            tickInterval={0}
          />
        </Suspense>
        <AssetVelocityPanel data={inventory} loading={!chartsLoaded} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_min(100%,320px)] xl:items-start">
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="h-[320px] animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
              <div className="h-[320px] animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
            </div>
          }
        >
          <DashboardCharts
            chartsLoaded={chartsLoaded}
            cachedAt={null}
            salesTrend={salesTrend}
            revenueBreakdown={revenueBreakdown}
            trendTitle="Monthly Sales Trends"
            trendSubtitle="Year to date (POS + mobile)"
            trendTickInterval={0}
          />
        </Suspense>

        <Card className="border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/70 xl:sticky xl:top-4" padding="none">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Alerts</h3>
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
                <Link to="/inventory" className="mt-2 inline-block text-xs font-medium text-[#0047AB] hover:underline dark:text-blue-300">
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
                              className="font-medium text-[#0047AB] hover:underline dark:text-blue-300"
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
                <Link to="/order-center" className="mt-2 inline-block text-xs font-medium text-[#0047AB] hover:underline dark:text-blue-300">
                  View all mobile orders
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default YearlyOverviewReportPanel;
