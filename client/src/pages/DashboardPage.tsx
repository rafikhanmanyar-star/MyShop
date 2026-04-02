import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { shopApi } from '../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../services/categoriesOfflineCache';
import { getDashboardCache, setDashboardCache, type DashboardStats } from '../services/dashboardOfflineCache';
import { getTenantId } from '../services/posOfflineDb';
import { mobileOrdersApi } from '../services/mobileOrdersApi';
import Card from '../components/ui/Card';
import { CURRENCY, ICONS } from '../constants';
import {
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  AlertTriangle,
  Building2,
  Monitor,
  LayoutGrid,
  Truck,
  DollarSign,
  Calendar,
  Smartphone,
  ArrowRight,
  Store,
  Undo2,
} from 'lucide-react';

function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
          const mobileOrdersPending = mobileList.filter(
            (o: any) =>
              (o.status ?? '').toLowerCase() === 'pending' ||
              (o.payment_status ?? '').toLowerCase() !== 'paid'
          ).length;

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
          return;
        }

        if (tenantId) {
          const cached = await getDashboardCache(tenantId);
          if (cached?.stats) {
            setStats(cached.stats);
            setCachedAt(cached.cachedAt || null);
            return;
          }
        }

        setCachedAt(null);
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
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const kpiCards = [
    {
      label: 'Products',
      value: stats.totalProducts,
      icon: Package,
      color: 'text-primary-600',
      bg: 'bg-primary-50 dark:bg-primary-900/30',
    },
    {
      label: 'Total Sales',
      value: stats.totalSales,
      icon: ShoppingCart,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    },
    {
      label: 'Gross revenue',
      value: `${CURRENCY} ${stats.totalRevenue.toLocaleString()}`,
      icon: TrendingUp,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-900/30',
      isString: true,
    },
    {
      label: 'Total returns',
      value: `${CURRENCY} ${(stats.totalReturns ?? 0).toLocaleString()}`,
      icon: Undo2,
      color: 'text-rose-600',
      bg: 'bg-rose-50 dark:bg-rose-900/30',
      isString: true,
    },
    {
      label: 'Net sales',
      value: `${CURRENCY} ${(stats.netRevenue ?? stats.totalRevenue).toLocaleString()}`,
      icon: DollarSign,
      color: 'text-emerald-700',
      bg: 'bg-emerald-50 dark:bg-emerald-900/30',
      isString: true,
    },
    {
      label: 'Loyalty Members',
      value: stats.totalCustomers,
      icon: Users,
      color: 'text-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-900/30',
    },
    {
      label: 'Low Stock',
      value: stats.lowStockItems,
      icon: AlertTriangle,
      color: 'text-rose-600',
      bg: 'bg-rose-50 dark:bg-rose-900/30',
    },
  ];

  const operationsCards = [
    {
      label: 'Branches',
      value: stats.branchesCount,
      icon: Building2,
      color: 'text-muted-foreground dark:text-muted-foreground',
      bg: 'bg-muted dark:bg-slate-700',
      link: '/multi-store',
    },
    {
      label: 'Terminals',
      value: stats.terminalsCount,
      icon: Monitor,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/30',
      link: '/multi-store',
    },
    {
      label: 'Categories',
      value: stats.categoriesCount,
      icon: LayoutGrid,
      color: 'text-teal-600',
      bg: 'bg-teal-50 dark:bg-teal-900/30',
    },
    {
      label: 'Vendors',
      value: stats.vendorsCount,
      icon: Truck,
      color: 'text-orange-600',
      bg: 'bg-orange-50 dark:bg-orange-900/30',
    },
    {
      label: 'Out of Stock',
      value: stats.outOfStockItems,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50 dark:bg-red-900/30',
      link: '/inventory',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <h1 className="page-title">Dashboard</h1>
        <Link
          to="/accounting/reports/daily"
          className="flex items-center gap-2 rounded-md border border-gray-200 bg-card px-4 py-2 text-sm font-medium uppercase tracking-widest text-foreground shadow-sm transition-all hover:border-primary-300 hover:text-primary-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:text-primary-400"
        >
          {ICONS.barChart} Daily Report
        </Link>
      </div>

      {cachedAt && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm border border-amber-200 dark:border-amber-700">
          Offline — showing cached data. Last updated: {new Date(cachedAt).toLocaleString()}
        </div>
      )}

      {/* Primary KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card
            key={card.label}
            className="p-6 border-none shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow"
          >
            <div
              className={`w-14 h-14 rounded-2xl ${card.bg} ${card.color} flex items-center justify-center flex-shrink-0`}
            >
              <card.icon className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {card.label}
              </p>
              <p className="text-xl font-bold text-foreground truncate">
                {card.isString ? card.value : typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Today's performance + Average order */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none bg-gradient-to-br from-primary-50 to-card p-6 shadow-sm dark:from-primary-900/20 dark:to-card">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-600 dark:bg-primary-900/40">
              <Calendar className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
                Today&apos;s Sales
              </p>
              <p className="text-2xl font-bold text-foreground">{stats.todaySalesCount}</p>
              <p className="text-sm text-muted-foreground">
                {CURRENCY} {stats.todayRevenue.toLocaleString()} revenue
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-6 border-none shadow-sm bg-gradient-to-br from-emerald-50 to-card dark:from-emerald-900/20 dark:to-card">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                Avg. Order Value
              </p>
              <p className="text-2xl font-bold text-foreground font-mono">
                {CURRENCY} {Math.round(stats.avgOrderValue).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-6 border-none shadow-sm bg-gradient-to-br from-amber-50 to-card dark:from-amber-900/20 dark:to-card">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center">
              <Smartphone className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                Mobile Orders Pending
              </p>
              <p className="text-2xl font-bold text-foreground">{stats.mobileOrdersPending}</p>
              {stats.mobileOrdersPending > 0 && (
                <Link
                  to="/mobile-orders"
                  className="text-sm text-amber-600 hover:underline inline-flex items-center gap-1"
                >
                  View orders <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Operations & setup row */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Operations & Setup</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {operationsCards.map((card) => {
            const content = (
              <Card
                key={card.label}
                className={`p-5 border-none shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow ${card.link ? 'cursor-pointer' : ''}`}
              >
                <div
                  className={`w-12 h-12 rounded-xl ${card.bg} ${card.color} flex items-center justify-center flex-shrink-0`}
                >
                  <card.icon className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="text-lg font-bold text-foreground">{card.value}</p>
                </div>
              </Card>
            );
            return card.link ? (
              <Link key={card.label} to={card.link}>
                {content}
              </Link>
            ) : (
              <React.Fragment key={card.label}>{content}</React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Quick actions / Getting started */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border-none shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Store className="h-5 w-5 text-primary-600" />
            Getting Started
          </h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>1. Set up <strong>Branches</strong> and <strong>Terminals</strong> in Multi-Store.</li>
            <li>2. Add <strong>Products</strong> and manage <strong>Inventory</strong>.</li>
            <li>3. Process sales via <strong>POS</strong> or accept <strong>Mobile Orders</strong>.</li>
            <li>4. Enroll customers in the <strong>Loyalty Program</strong>.</li>
            <li>5. Configure <strong>Policies</strong> (tax, pricing) in Settings.</li>
          </ul>
        </Card>
        <Card className="p-6 border-none shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/pos"
              className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors text-sm font-medium"
            >
              <ShoppingCart className="w-4 h-4" /> POS
            </Link>
            <Link
              to="/inventory"
              className="flex items-center gap-3 rounded-lg bg-primary-50 p-3 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 dark:bg-primary-950/30 dark:text-primary-400 dark:hover:bg-primary-950/50"
            >
              <Package className="w-4 h-4" /> Inventory
            </Link>
            <Link
              to="/accounting"
              className="flex items-center gap-2 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors text-sm font-medium"
            >
              <DollarSign className="w-4 h-4" /> Accounting
            </Link>
            <Link
              to="/analytics"
              className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors text-sm font-medium"
            >
              <TrendingUp className="w-4 h-4" /> Analytics
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
