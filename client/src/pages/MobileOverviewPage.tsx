import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useShopTimezone } from '../context/ShopTimezoneContext';
import {
  shopApi,
  accountingApi,
  khataApi,
  procurementApi,
  type KhataSummaryRow,
  type DashboardOverviewResponse,
} from '../services/shopApi';
import { orderCenterApi } from '../services/orderCenterApi';
import { mobileOrdersApi, type PosRidersOverview } from '../services/mobileOrdersApi';
import { getDashboardCache, type DashboardStats } from '../services/dashboardOfflineCache';
import { getTenantId } from '../services/posOfflineDb';
import { CURRENCY } from '../constants';
import ThemeToggle from '../components/ui/ThemeToggle';
import MobileUserMenu from '../components/mobile/MobileUserMenu';
import MobileStatGrid, { type MobileStatTile } from '../components/mobile/MobileStatGrid';
import {
  defaultMobileModuleId,
  isMobileModuleId,
  mobileModulesForRole,
  MOBILE_MODULE_HERO_CLASS,
  MOBILE_MODULE_ICON_CLASS,
  type MobileModuleId,
} from '../components/mobile/mobileOverviewModules';

function formatMoney(n: number) {
  return `${CURRENCY} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function sumKhataReceivables(rows: KhataSummaryRow[]) {
  let total = 0;
  let customers = 0;
  for (const r of rows) {
    const bal = Number(r.balance) || 0;
    if (bal > 0) {
      total += bal;
      customers += 1;
    }
  }
  return { total, customers };
}

type MobileOverviewData = {
  dashboard: DashboardStats | null;
  profit7d: { totalProfit: number; avgProfitPerDay: number } | null;
  dailyNetProfit: number;
  dailyNetSales: number;
  khata: { totalReceivables: number; customersWithBalance: number; totalCustomers: number };
  procurement: {
    totalOutstanding: number;
    overdue: number;
    openBills: number;
    draftBills: number;
  };
  orderCenter: {
    newOrders: number;
    preparing: number;
    unpaid: number;
    voicePending: number;
    ridersAvailable: number;
    openDeliveries: number;
  };
  loyalty: {
    totalMembers: number;
    activeMembers: number;
    pointsOutstanding: number;
    pointsIssued: number;
  };
};

const EMPTY_DATA: MobileOverviewData = {
  dashboard: null,
  profit7d: null,
  dailyNetProfit: 0,
  dailyNetSales: 0,
  khata: { totalReceivables: 0, customersWithBalance: 0, totalCustomers: 0 },
  procurement: { totalOutstanding: 0, overdue: 0, openBills: 0, draftBills: 0 },
  orderCenter: {
    newOrders: 0,
    preparing: 0,
    unpaid: 0,
    voicePending: 0,
    ridersAvailable: 0,
    openDeliveries: 0,
  },
  loyalty: { totalMembers: 0, activeMembers: 0, pointsOutstanding: 0, pointsIssued: 0 },
};

function tilesForModule(id: MobileModuleId, data: MobileOverviewData): MobileStatTile[] {
  switch (id) {
    case 'dashboard': {
      const s = data.dashboard;
      return [
        {
          label: "Today's sales",
          value: String(s?.todaySalesCount ?? 0),
          hint: `${formatMoney(s?.todayRevenue ?? 0)} revenue today`,
          featured: true,
        },
        { label: 'Net sales today', value: formatMoney(data.dailyNetSales) },
        {
          label: '7-day profit',
          value: data.profit7d ? formatMoney(data.profit7d.totalProfit) : '—',
          hint: data.profit7d ? `Avg ${formatMoney(data.profit7d.avgProfitPerDay)}/day` : undefined,
        },
        { label: 'Net profit today', value: formatMoney(data.dailyNetProfit) },
        { label: 'Low stock SKUs', value: String(s?.lowStockItems ?? 0) },
        { label: 'Mobile pending', value: String(s?.mobileOrdersPending ?? 0) },
      ];
    }
    case 'khata':
      return [
        {
          label: 'Total receivables',
          value: formatMoney(data.khata.totalReceivables),
          hint: `${data.khata.customersWithBalance} customers owing`,
          featured: true,
        },
        { label: 'Customers owing', value: String(data.khata.customersWithBalance) },
        { label: 'Ledger accounts', value: String(data.khata.totalCustomers) },
        {
          label: 'Avg balance',
          value:
            data.khata.customersWithBalance > 0
              ? formatMoney(data.khata.totalReceivables / data.khata.customersWithBalance)
              : formatMoney(0),
        },
      ];
    case 'procurement':
      return [
        {
          label: 'Total payables',
          value: formatMoney(data.procurement.totalOutstanding),
          hint: `${formatMoney(data.procurement.overdue)} overdue`,
          featured: true,
        },
        { label: 'Overdue AP', value: formatMoney(data.procurement.overdue) },
        { label: 'Open bills', value: String(data.procurement.openBills) },
        { label: 'Draft bills', value: String(data.procurement.draftBills) },
      ];
    case 'orders':
      return [
        {
          label: 'New orders',
          value: String(data.orderCenter.newOrders),
          hint: `${data.orderCenter.preparing} preparing · ${data.orderCenter.unpaid} unpaid`,
          featured: true,
        },
        { label: 'Preparing', value: String(data.orderCenter.preparing) },
        { label: 'Unpaid', value: String(data.orderCenter.unpaid) },
        { label: 'Voice pending', value: String(data.orderCenter.voicePending) },
        { label: 'Riders available', value: String(data.orderCenter.ridersAvailable) },
        { label: 'Out for delivery', value: String(data.orderCenter.openDeliveries) },
      ];
    case 'loyalty':
      return [
        {
          label: 'Total members',
          value: String(data.loyalty.totalMembers),
          hint: `${data.loyalty.activeMembers} active`,
          featured: true,
        },
        { label: 'Active members', value: String(data.loyalty.activeMembers) },
        { label: 'Points outstanding', value: data.loyalty.pointsOutstanding.toLocaleString() },
        { label: 'Lifetime points', value: data.loyalty.pointsIssued.toLocaleString() },
      ];
    default:
      return [];
  }
}

export default function MobileOverviewPage() {
  const { user } = useAuth();
  const role = user?.role || 'pos_cashier';
  const [searchParams, setSearchParams] = useSearchParams();
  const modules = useMemo(() => mobileModulesForRole(role), [role]);
  const tabParam = searchParams.get('tab');
  const activeTab: MobileModuleId = isMobileModuleId(tabParam, role)
    ? tabParam
    : defaultMobileModuleId(role);
  const activeModule = modules.find((m) => m.id === activeTab) ?? modules[0] ?? null;

  const { todayYmd, lastYmdDays, loading: timezoneLoading } = useShopTimezone();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MobileOverviewData>(EMPTY_DATA);
  const [orgName, setOrgName] = useState('MyShop');

  useEffect(() => {
    if (!modules.length) return;
    if (!isMobileModuleId(tabParam, role)) {
      setSearchParams({ tab: defaultMobileModuleId(role) }, { replace: true });
    }
  }, [tabParam, role, modules.length, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    const tenantId = getTenantId();
    const today = todayYmd();
    const trendDayKeys = lastYmdDays(7);
    const next: MobileOverviewData = { ...EMPTY_DATA };
    const moduleIds = new Set(modules.map((m) => m.id));

    try {
      const tasks: Promise<void>[] = [];

      if (moduleIds.has('dashboard')) {
        tasks.push(
          (async () => {
            let overview: DashboardOverviewResponse | null = null;
            try {
              overview = await shopApi.getDashboardOverview();
            } catch {
              if (tenantId) {
                const cached = await getDashboardCache(tenantId);
                overview = cached
                  ? { stats: cached.stats, lowStockRows: [], pendingOrders: [] }
                  : null;
              }
            }
            next.dashboard = overview?.stats ?? null;

            const [daily, profit] = await Promise.all([
              accountingApi.dailyReportSummary(today).catch(() => null),
              accountingApi.dailyProfitSummary(trendDayKeys).catch(() => null),
            ]);
            next.dailyNetProfit = Number(daily?.netProfitDaily) || 0;
            next.dailyNetSales = Number(daily?.netTotalSales) || 0;
            if (profit && typeof profit === 'object') {
              next.profit7d = {
                totalProfit: Number(profit.totalProfit) || 0,
                avgProfitPerDay: Number(profit.avgProfitPerDay) || 0,
              };
            }
          })()
        );
      }

      if (moduleIds.has('khata')) {
        tasks.push(
          (async () => {
            const rows = await khataApi.getSummary().catch(() => []);
            const list = Array.isArray(rows) ? rows : [];
            const { total, customers } = sumKhataReceivables(list);
            next.khata = {
              totalReceivables: total,
              customersWithBalance: customers,
              totalCustomers: list.length,
            };
          })()
        );
      }

      if (moduleIds.has('procurement')) {
        tasks.push(
          (async () => {
            const ap = await procurementApi.reports.apAging().catch(() => null);
            const summary = ap?.summary ?? {};
            const cur = Number(summary.current) || 0;
            const d30 = Number(summary.days30) || 0;
            const d60 = Number(summary.days60) || 0;
            const d90 = Number(summary.days90Plus) || 0;
            const total = Number(ap?.totalOutstanding) || cur + d30 + d60 + d90;
            const pipeline = ap?.pipeline ?? {};
            next.procurement = {
              totalOutstanding: total,
              overdue: d30 + d60 + d90,
              openBills: Number(pipeline.openPostedCount) || 0,
              draftBills: Number(pipeline.draftCount) || 0,
            };
          })()
        );
      }

      if (moduleIds.has('orders')) {
        tasks.push(
          (async () => {
            const [queue, riders] = await Promise.all([
              orderCenterApi.getQueue().catch(() => null),
              mobileOrdersApi.getRidersOverview().catch(() => null),
            ]);
            const counts = queue?.counts;
            const riderStats = (riders as PosRidersOverview | null)?.stats;
            next.orderCenter = {
              newOrders: Number(counts?.new) || 0,
              preparing: Number(counts?.preparing) || 0,
              unpaid: Number(counts?.unpaid) || 0,
              voicePending: Number(counts?.voice_pending) || 0,
              ridersAvailable: Number(riderStats?.available) || 0,
              openDeliveries: Number(riderStats?.open_deliveries) || 0,
            };
          })()
        );
      }

      if (moduleIds.has('loyalty')) {
        tasks.push(
          (async () => {
            const members = await shopApi.getLoyaltyMembers().catch(() => []);
            const list = Array.isArray(members) ? members : [];
            let active = 0;
            let pointsOutstanding = 0;
            let pointsIssued = 0;
            for (const m of list) {
              const status = String(m.status ?? '').toLowerCase();
              if (status === 'active' || status === '') active += 1;
              pointsOutstanding += parseInt(String(m.points_balance), 10) || 0;
              pointsIssued += parseInt(String(m.lifetime_points), 10) || 0;
            }
            next.loyalty = {
              totalMembers: list.length,
              activeMembers: active,
              pointsOutstanding,
              pointsIssued,
            };
          })()
        );
      }

      tasks.push(
        shopApi
          .getOrganization()
          .then((org) => setOrgName(org.company_name?.trim() || org.name?.trim() || 'MyShop'))
          .catch(() => {})
      );

      await Promise.all(tasks);
      setData(next);
    } finally {
      setLoading(false);
    }
  }, [modules, todayYmd, lastYmdDays]);

  useEffect(() => {
    if (timezoneLoading) return;
    void load();
  }, [load, timezoneLoading]);

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

  const activeTiles = useMemo(
    () => (activeModule ? tilesForModule(activeModule.id, data) : []),
    [activeModule, data]
  );

  const ActiveIcon = activeModule?.icon;
  const heroClass = activeModule ? MOBILE_MODULE_HERO_CLASS[activeModule.id] : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#ECEFF3] dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/95 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-slate-900/95">
        <div className="px-4 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[#4A90E2] dark:text-[#9bc5f0]">
                {orgName}
              </p>
              <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight text-[#212529] dark:text-foreground">
                {activeModule?.label ?? 'Overview'}
              </h1>
            </div>
            <MobileUserMenu />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-[#6C757D] dark:text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2} />
              <span className="truncate tabular-nums">{todayLabel}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-[#6C757D] transition active:scale-95 hover:bg-gray-100 disabled:opacity-60 dark:border-gray-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                aria-label="Refresh stats"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-4 pb-28">
        {!activeModule ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-[#6C757D] shadow-sm dark:border-gray-700 dark:bg-card dark:text-muted-foreground">
            No overview modules are available for your role.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Module hero */}
            <div
              className={`overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-sm dark:from-opacity-10 ${heroClass}`}
            >
              <div className="flex items-start gap-3">
                {ActiveIcon ? (
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${MOBILE_MODULE_ICON_CLASS[activeModule.id]}`}
                  >
                    <ActiveIcon className="h-6 w-6" strokeWidth={2} />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">{activeModule.label}</h2>
                  <p className="mt-1 text-sm leading-snug text-[#6C757D] dark:text-muted-foreground">
                    {activeModule.subtitle}
                  </p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:border-gray-800 dark:bg-card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6C757D] dark:text-muted-foreground">
                  Key metrics
                </h3>
                {!loading && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Live
                  </span>
                )}
              </div>
              <MobileStatGrid tiles={activeTiles} loading={loading} />
            </section>

            <p className="pb-2 text-center text-[0.65rem] text-[#6C757D] dark:text-muted-foreground">
              Pull down or tap refresh to update · Switch modules from the bar below
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
