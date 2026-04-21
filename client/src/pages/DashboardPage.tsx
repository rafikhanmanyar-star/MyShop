import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { shopApi, accountingApi } from '../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../services/categoriesOfflineCache';
import { getDashboardCache, setDashboardCache, type DashboardStats } from '../services/dashboardOfflineCache';
import { getTenantId } from '../services/posOfflineDb';
import { mobileOrdersApi } from '../services/mobileOrdersApi';
import Card from '../components/ui/Card';
import DailyReportSummaryPanel from '../components/shop/accounting/DailyReportSummaryPanel';
import { CURRENCY, ICONS } from '../constants';
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
} from 'lucide-react';

const CHART_BLUE = '#4A90E2';
const DONUT_COLORS = ['#4A90E2', '#50C878', '#F6C23E', '#E74A3B', '#9B59B6', '#17A2B8', '#6C757D'];

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--card-foreground)',
} as const;

function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type LowStockRow = { name: string; qty: string };
type PendingOrderRow = { id: string; orderNumber: string; customer: string };

function mergeDailyTrend(raw: unknown): { label: string; revenue: number }[] {
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
  const out: { label: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    const label = dt.toLocaleDateString('en', { weekday: 'short' });
    out.push({ label, revenue: Math.round((byDay.get(key) || 0) * 100) / 100 });
  }
  return out;
}

function isMobileOrderPending(o: Record<string, unknown>) {
  const status = String(o.status ?? '').toLowerCase();
  const paymentStatus = String(o.payment_status ?? o.paymentStatus ?? '').toLowerCase();
  return status === 'pending' || paymentStatus !== 'paid';
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
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
  });
  const [loading, setLoading] = useState(true);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [lowStockRows, setLowStockRows] = useState<LowStockRow[]>([]);
  const [pendingOrderRows, setPendingOrderRows] = useState<PendingOrderRow[]>([]);
  const [salesTrend, setSalesTrend] = useState<{ label: string; revenue: number }[]>([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [chartsLoaded, setChartsLoaded] = useState(false);

  useEffect(() => {
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    async function load() {
      try {
        if (isOnline && tenantId) {
          const [
            products,
            sales,
            loyaltyMembers,
            inventory,
            branches,
            terminals,
            categories,
            vendors,
            mobileOrders,
            salesReturns,
            trendRaw,
            categoryPerf,
          ] = await Promise.all([
            shopApi.getProducts().catch(() => []),
            shopApi.getSales().catch(() => []),
            shopApi.getLoyaltyMembers().catch(() => []),
            shopApi.getInventory().catch(() => []),
            shopApi.getBranches().catch(() => []),
            shopApi.getTerminals().catch(() => []),
            getShopCategoriesOfflineFirst().catch(() => []),
            shopApi.getVendors().catch(() => []),
            mobileOrdersApi.getOrders().catch(() => []),
            shopApi.getSalesReturns().catch(() => []),
            accountingApi.getDailyTrend(7).catch(() => null),
            accountingApi.getCategoryPerformance().catch(() => []),
          ]);

          const salesList = (sales as any[]) || [];
          const totalRevenue = salesList.reduce(
            (sum: number, s: any) => sum + parseFloat(s.grandTotal ?? s.grand_total ?? 0),
            0
          );
          const retList = (salesReturns as any[]) || [];
          const totalReturns = retList.reduce(
            (sum: number, r: any) => sum + parseFloat(r.totalReturnAmount ?? r.total_return_amount ?? 0),
            0
          );
          const netRevenue = Math.max(0, totalRevenue - totalReturns);
          const invList = (inventory as any[]) || [];
          const productList = (products as any[]) || [];
          const productNameById = new Map<string, string>(
            productList.map((p: any) => [String(p.id), String(p.name ?? p.sku ?? 'Item')])
          );

          const lowStockRowsBuilt: LowStockRow[] = invList
            .map((i: any) => {
              const q = parseFloat(i.quantity_on_hand ?? i.quantityOnHand ?? 0);
              const pid = String(i.product_id ?? i.productId ?? '');
              return {
                q,
                name: productNameById.get(pid) || 'Unknown',
              };
            })
            .filter((row) => row.q > 0 && row.q <= 10)
            .sort((a, b) => a.q - b.q)
            .slice(0, 6)
            .map((row) => ({ name: row.name, qty: row.q % 1 === 0 ? String(row.q) : row.q.toFixed(1) }));

          setLowStockRows(lowStockRowsBuilt);

          const lowStockItems = invList.filter(
            (i: any) => parseFloat(i.quantity_on_hand ?? i.quantityOnHand ?? 0) <= 10
          ).length;
          const outOfStockItems = invList.filter(
            (i: any) => parseFloat(i.quantity_on_hand ?? i.quantityOnHand ?? 0) <= 0
          ).length;

          const todayStart = getTodayStart();
          const todaySales = salesList.filter((s: any) => {
            const t = new Date(s.created_at ?? s.createdAt ?? 0).getTime();
            return t >= todayStart;
          });
          const todayRevenue = todaySales.reduce(
            (sum: number, s: any) => sum + parseFloat(s.grandTotal ?? s.grand_total ?? 0),
            0
          );

          const mobileList = (mobileOrders as any[]) || [];
          const mobileOrdersPending = mobileList.filter((o: any) => isMobileOrderPending(o)).length;

          const pendingRows: PendingOrderRow[] = mobileList
            .filter((o: any) => isMobileOrderPending(o))
            .slice(0, 6)
            .map((o: any) => ({
              id: String(o.id),
              orderNumber: String(o.order_number ?? o.orderNumber ?? '—'),
              customer: String(o.customer_name ?? o.customerName ?? '—'),
            }));
          setPendingOrderRows(pendingRows);

          const totalSalesCount = salesList.length;
          const nextStats: DashboardStats = {
            totalProducts: (products as any[]).length,
            totalSales: totalSalesCount,
            totalRevenue,
            totalReturns,
            netRevenue,
            totalCustomers: (loyaltyMembers as any[]).length,
            lowStockItems,
            outOfStockItems,
            branchesCount: (branches as any[]).length,
            terminalsCount: (terminals as any[]).length,
            categoriesCount: (categories as any[]).length,
            vendorsCount: (vendors as any[]).length,
            todaySalesCount: todaySales.length,
            todayRevenue,
            avgOrderValue: totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0,
            mobileOrdersPending,
          };
          setStats(nextStats);
          setCachedAt(null);
          await setDashboardCache(tenantId, nextStats);

          const merged = mergeDailyTrend(trendRaw);
          setSalesTrend(merged);
          const catArr = Array.isArray(categoryPerf) ? categoryPerf : [];
          const pie = catArr
            .map((c: any) => ({
              name: String(c.category ?? 'Uncategorized'),
              value: Math.max(0, parseFloat(c.revenue) || 0),
            }))
            .filter((x) => x.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 7);
          setRevenueBreakdown(pie);
          setChartsLoaded(true);
          return;
        }

        if (tenantId) {
          const cached = await getDashboardCache(tenantId);
          if (cached?.stats) {
            setStats(cached.stats);
            setCachedAt(cached.cachedAt || null);
          }
        }

        setCachedAt(null);
        setChartsLoaded(false);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
        if (tenantId) {
          try {
            const cached = await getDashboardCache(tenantId);
            if (cached?.stats) {
              setStats(cached.stats);
              setCachedAt(cached.cachedAt || null);
            }
          } catch {
            setCachedAt(null);
          }
        }
        setChartsLoaded(false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

  const kpiCards = [
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="-mx-4 min-h-full bg-[#F8F9FA] px-4 py-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 dark:bg-background">
      <div className="space-y-8">
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
            <Link
              to="/accounting/reports/daily"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-[#212529] shadow-sm transition-colors hover:border-[#4A90E2]/50 hover:text-[#4A90E2] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:text-primary-400"
            >
              {ICONS.barChart} Daily report (full page)
            </Link>
          </div>
        </div>

        {cachedAt && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            Offline — showing cached data. Last updated: {new Date(cachedAt).toLocaleString()}
          </div>
        )}

        <section id="daily-report" className="scroll-mt-6 space-y-3" aria-labelledby="daily-report-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="daily-report-heading" className="text-lg font-semibold text-[#212529] dark:text-foreground">
              Daily report
            </h2>
            <p className="text-xs text-[#6C757D] dark:text-muted-foreground">
              POS, mobile, inventory movement, expenses, khata, and net profit for the date you select.
            </p>
          </div>
          <div className="rounded-[10px] border border-gray-200 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-card sm:p-4">
            <DailyReportSummaryPanel />
          </div>
        </section>

        <section id="business-overview" className="scroll-mt-6 space-y-4" aria-labelledby="overview-heading">
          <div>
            <h2 id="overview-heading" className="text-lg font-semibold text-[#212529] dark:text-foreground">
              Business overview
            </h2>
            <p className="mt-0.5 text-sm text-[#6C757D] dark:text-muted-foreground">
              Overall stats (catalog, sales, loyalty), 7-day revenue trend, category mix, and operational alerts.
            </p>
          </div>

        {/* KPI grid — 2×4 */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {kpiCards.map((card) => (
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
                  to="/mobile-orders"
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

        {/* Charts + Alerts */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_min(100%,320px)] xl:items-start">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border border-gray-100 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none" padding="none">
              <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
                <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">Daily Sales Trends</h2>
                <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">Last 7 days (POS + mobile)</p>
              </div>
              <div className="p-4 pt-2">
                {!chartsLoaded || salesTrend.length === 0 ? (
                  <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                    {cachedAt ? 'Charts need an online connection.' : 'No trend data yet.'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dashAreaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_BLUE} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={CHART_BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                      />
                      <Tooltip
                        formatter={(v: number) => [`${CURRENCY} ${v.toLocaleString()}`, 'Revenue']}
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: 'var(--muted-foreground)' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke={CHART_BLUE}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#dashAreaFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="border border-gray-100 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none" padding="none">
              <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
                <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">Revenue Breakdown</h2>
                <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">By product category</p>
              </div>
              <div className="p-4 pt-2">
                {!chartsLoaded || revenueBreakdown.length === 0 ? (
                  <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                    {cachedAt ? 'Charts need an online connection.' : 'No category data yet.'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={revenueBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={88}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) =>
                          `${String(name).slice(0, 10)}${String(name).length > 10 ? '…' : ''} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {revenueBreakdown.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [`${CURRENCY} ${v.toLocaleString()}`, 'Revenue']}
                        contentStyle={tooltipStyle}
                      />
                      <Legend
                        layout="horizontal"
                        verticalAlign="bottom"
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          {/* Alerts column */}
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
                                to={`/mobile-orders?order=${encodeURIComponent(row.id)}`}
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
                    to="/mobile-orders"
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
      </div>
    </div>
  );
}
