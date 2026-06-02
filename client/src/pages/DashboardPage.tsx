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
import { promiseWithTimeout } from '../utils/promiseTimeout';

const CACHE_READ_TIMEOUT_MS = 4_000;
const OVERVIEW_FETCH_TIMEOUT_MS = 45_000;

const DashboardCharts = lazy(() => import('../components/dashboard/DashboardCharts'));

type LowStockRow = { name: string; qty: string };
type PendingOrderRow = { id: string; orderNumber: string; customer: string };
type DashboardReportTab = 'daily' | 'weekly' | 'monthly';

function mergeDailyTrend(
  raw: unknown,
  dayKeys: string[],
  timeZone: string
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
    const label = dt.toLocaleDateString('en', { weekday: 'short', timeZone });
    return { label, revenue: Math.round((byDay.get(key) || 0) * 100) / 100 };
  });
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
  const { lastYmdDays, timezone, loading: timezoneLoading } = useShopTimezone();
  const trendDayKeys = useMemo(() => lastYmdDays(7), [lastYmdDays, timezone]);
  const trendDayKeysKey = trendDayKeys.join(',');
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
        const [trendRaw, categoryPerf, profitSummary] = await Promise.all([
          accountingApi.getDailyTrend(7).catch(() => null),
          accountingApi.getCategoryPerformance().catch(() => []),
          accountingApi.dailyProfitSummary(trendDayKeys).catch(() => null),
        ]);
        if (cancelled || loadGenRef.current !== gen) return;
        setSalesTrend(mergeDailyTrend(trendRaw, trendDayKeys, timezone));
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
        setChartsLoaded(true);
      } catch {
        if (!cancelled) {
          setChartsLoaded(false);
          setProfit7d(null);
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
  }, [timezone, trendDayKeysKey, timezoneLoading]);

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

  const weeklyKpiCards = [
    {
      label: 'Products',
      value: stats.totalProducts,
      icon: Package,
      iconClass: 'text-[#4A90E2]',
    },
    {
      label: 'Total Sales',
      value: stats.totalSales,
      icon: ShoppingCart,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Gross revenue',
      value: `${CURRENCY} ${stats.totalRevenue.toLocaleString()}`,
      icon: TrendingUp,
      iconClass: 'text-violet-600 dark:text-violet-400',
      isString: true,
    },
    {
      label: 'Net sales',
      value: `${CURRENCY} ${(stats.netRevenue ?? stats.totalRevenue).toLocaleString()}`,
      icon: DollarSign,
      iconClass: 'text-emerald-700 dark:text-emerald-300',
      isString: true,
    },
    {
      label: '7-day profit',
      value:
        profit7d != null
          ? `${CURRENCY} ${profit7d.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : '—',
      icon: LineChart,
      iconClass: 'text-teal-600 dark:text-teal-400',
      isString: true,
      sub:
        profit7d != null
          ? `Avg ${CURRENCY} ${profit7d.avgProfitPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 })}/day`
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

  const monthlyOverviewCards = [
    {
      label: 'Monthly gross revenue',
      value: `${CURRENCY} ${stats.totalRevenue.toLocaleString()}`,
      sub: 'Current month-to-date',
    },
    {
      label: 'Monthly net sales',
      value: `${CURRENCY} ${(stats.netRevenue ?? stats.totalRevenue).toLocaleString()}`,
      sub: 'Current month-to-date',
    },
    {
      label: 'Avg order value',
      value: `${CURRENCY} ${stats.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      sub: 'Month-to-date average',
    },
    {
      label: 'Monthly orders',
      value: stats.totalSales.toLocaleString(),
      sub: 'Total orders in current period',
    },
    {
      label: 'Active customers',
      value: stats.totalCustomers.toLocaleString(),
      sub: 'Loyalty/customer base',
    },
    {
      label: 'Mobile pending',
      value: stats.mobileOrdersPending.toLocaleString(),
      sub: 'Open mobile orders',
    },
  ];

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
                Monthly business overview
              </h2>
              <p className="mt-0.5 text-sm text-[#6C757D] dark:text-muted-foreground">
                Month-to-date business snapshot across revenue, orders, customers, and profitability.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {monthlyOverviewCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-[10px] border border-gray-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-card dark:shadow-none"
                >
                  <p className="text-xs font-medium text-[#6C757D] dark:text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[#212529] dark:text-foreground">{card.value}</p>
                  <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">{card.sub}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-[10px] border border-gray-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-card dark:shadow-none">
                <h3 className="text-sm font-semibold text-[#212529] dark:text-foreground">Revenue trend</h3>
                <p className="mt-1 text-xs text-[#6C757D] dark:text-muted-foreground">
                  Trend and category charts are shared from the existing dashboard analytics.
                </p>
                <div className="mt-3">
                  <Suspense
                    fallback={<div className="h-[260px] animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />}
                  >
                    <DashboardCharts
                      chartsLoaded={chartsLoaded}
                      cachedAt={cachedAt}
                      salesTrend={salesTrend}
                      revenueBreakdown={revenueBreakdown}
                    />
                  </Suspense>
                </div>
              </div>
              <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/25">
                <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Monthly profitability</h3>
                <p className="mt-2 text-sm text-emerald-900/90 dark:text-emerald-300/90">
                  {profit7d
                    ? `${CURRENCY} ${profit7d.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })} recent profit benchmark`
                    : 'Profit benchmark is loading from current report data.'}
                </p>
              </div>
            </div>
          </section>
        )}
        </div>
      </div>
    </div>
  );
}
