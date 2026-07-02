import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useShopTimezone } from '../context/ShopTimezoneContext';
import { lastNDayRangeIso } from '../utils/shopTimezone';
import {
  shopApi,
  accountingApi,
  khataApi,
  procurementApi,
  type KhataSummaryRow,
  type DashboardOverviewResponse,
} from '../services/shopApi';
import MobileAccountingPanel, {
  type MobileAccountingAccount,
  type MobileAccountingBankRow,
  type MobileAccountingSummary,
} from '../components/mobile/MobileAccountingPanel';
import { orderCenterApi } from '../services/orderCenterApi';
import { mobileOrdersApi, type PosRidersOverview } from '../services/mobileOrdersApi';
import { getDashboardCache, type DashboardStats } from '../services/dashboardOfflineCache';
import { getTenantId } from '../services/posOfflineDb';
import { CURRENCY } from '../constants';
import ThemeToggle from '../components/ui/ThemeToggle';
import MobileUserMenu from '../components/mobile/MobileUserMenu';
import MobileStatGrid, { type MobileStatTile } from '../components/mobile/MobileStatGrid';
import MobilePeriodTabs, { isMobilePeriod, type MobilePeriod } from '../components/mobile/MobilePeriodTabs';
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

type PeriodStats = { totalSales: number; totalRevenue: number; netRevenue: number };
type ProfitStats = { totalProfit: number; avgProfitPerDay: number };

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

type InventorySummary = {
  stockValue: number;
  totalSkus: number;
  lowStock: number;
  outOfStock: number;
  expiring7: number;
  expiring30: number;
};

type MobileOverviewData = {
  dashboard: DashboardStats | null;
  dailyNetProfit: number;
  dailyNetSales: number;
  periodWeekly: PeriodStats | null;
  periodMonthly: PeriodStats | null;
  profit7d: ProfitStats | null;
  profit30d: ProfitStats | null;
  inventory: InventorySummary;
  accounting: {
    summary: MobileAccountingSummary;
    accounts: MobileAccountingAccount[];
    bankAccounts: MobileAccountingBankRow[];
  };
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
};

const EMPTY_INVENTORY: InventorySummary = {
  stockValue: 0,
  totalSkus: 0,
  lowStock: 0,
  outOfStock: 0,
  expiring7: 0,
  expiring30: 0,
};

const EMPTY_ACCOUNTING_SUMMARY: MobileAccountingSummary = {
  totalRevenue: 0,
  grossProfit: 0,
  netMargin: 0,
  netProfit: 0,
  receivablesTotal: 0,
  customerAdvances: 0,
  inventoryValuation: 0,
  totalAssets: 0,
};

const EMPTY_DATA: MobileOverviewData = {
  dashboard: null,
  dailyNetProfit: 0,
  dailyNetSales: 0,
  periodWeekly: null,
  periodMonthly: null,
  profit7d: null,
  profit30d: null,
  inventory: EMPTY_INVENTORY,
  accounting: { summary: EMPTY_ACCOUNTING_SUMMARY, accounts: [], bankAccounts: [] },
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
};

function dashboardTiles(data: MobileOverviewData, period: MobilePeriod): MobileStatTile[] {
  const s = data.dashboard;

  if (period === 'today') {
    return [
      {
        label: "Today's sales",
        value: String(s?.todaySalesCount ?? 0),
        hint: `${formatMoney(s?.todayRevenue ?? 0)} revenue today`,
        featured: true,
      },
      { label: 'Net sales today', value: formatMoney(data.dailyNetSales) },
      { label: 'Net profit today', value: formatMoney(data.dailyNetProfit) },
      { label: 'Low stock SKUs', value: String(s?.lowStockItems ?? 0) },
      { label: 'Mobile pending', value: String(s?.mobileOrdersPending ?? 0) },
    ];
  }

  const periodConfig: Record<
    Exclude<MobilePeriod, 'today'>,
    { stats: PeriodStats | null; profit: ProfitStats | null; days: number; profitLabel: string }
  > = {
    weekly: { stats: data.periodWeekly, profit: data.profit7d, days: 7, profitLabel: '7-day profit' },
    monthly: { stats: data.periodMonthly, profit: data.profit30d, days: 30, profitLabel: '30-day profit' },
  };

  const cfg = periodConfig[period];
  const stats = cfg.stats;
  const profit = cfg.profit;

  return [
    {
      label: 'Total sales',
      value: String(stats?.totalSales ?? 0),
      hint: `Last ${cfg.days} days`,
      featured: true,
    },
    { label: 'Gross revenue', value: formatMoney(stats?.totalRevenue ?? 0) },
    { label: 'Net sales', value: formatMoney(stats?.netRevenue ?? 0) },
    {
      label: cfg.profitLabel,
      value: profit ? formatMoney(profit.totalProfit) : '—',
      hint: profit ? `Avg ${formatMoney(profit.avgProfitPerDay)}/day` : undefined,
    },
    { label: 'Mobile pending', value: String(s?.mobileOrdersPending ?? 0) },
  ];
}

function inventorySummaryTiles(data: MobileOverviewData): MobileStatTile[] {
  const inv = data.inventory;
  const s = data.dashboard;
  return [
    {
      label: 'Stock value',
      value: formatMoney(inv.stockValue),
      hint: 'Inventory at cost',
      featured: true,
    },
    { label: 'Total SKUs', value: String(inv.totalSkus || s?.totalProducts || 0) },
    { label: 'Low stock', value: String(inv.lowStock || s?.lowStockItems || 0) },
    { label: 'Out of stock', value: String(inv.outOfStock || s?.outOfStockItems || 0) },
    ...(inv.expiring7 > 0
      ? [{ label: 'Expiring (7d)', value: String(inv.expiring7), hint: 'Units in next 7 days' }]
      : []),
    ...(inv.expiring30 > 0
      ? [{ label: 'Expiring (30d)', value: String(inv.expiring30), hint: 'Units in next 30 days' }]
      : []),
  ];
}

function tilesForModule(
  id: MobileModuleId,
  data: MobileOverviewData,
  period: MobilePeriod
): MobileStatTile[] {
  switch (id) {
    case 'dashboard':
      return dashboardTiles(data, period);
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
    case 'accounting':
      return [
        {
          label: 'Total revenue',
          value: formatMoney(data.accounting.summary.totalRevenue),
          featured: true,
        },
        { label: 'Gross profit', value: formatMoney(data.accounting.summary.grossProfit) },
        { label: 'Net profit', value: formatMoney(data.accounting.summary.netProfit) },
        {
          label: 'Net margin',
          value: `${data.accounting.summary.netMargin.toFixed(1)}%`,
        },
        { label: 'Receivables', value: formatMoney(data.accounting.summary.receivablesTotal) },
        { label: 'Total assets', value: formatMoney(data.accounting.summary.totalAssets) },
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
  const periodParam = searchParams.get('period');
  const activeTab: MobileModuleId = isMobileModuleId(tabParam, role)
    ? tabParam
    : defaultMobileModuleId(role);
  const activePeriod: MobilePeriod = isMobilePeriod(periodParam) ? periodParam : 'today';
  const activeModule = modules.find((m) => m.id === activeTab) ?? modules[0] ?? null;

  const { todayYmd, timezone, loading: timezoneLoading } = useShopTimezone();
  const weeklyRange = useMemo(() => lastNDayRangeIso(7, timezone), [timezone]);
  const monthlyRange = useMemo(() => lastNDayRangeIso(30, timezone), [timezone]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MobileOverviewData>(EMPTY_DATA);
  const [orgName, setOrgName] = useState('MyShop');

  useEffect(() => {
    if (!modules.length) return;
    const nextParams: Record<string, string> = {};
    if (!isMobileModuleId(tabParam, role)) {
      nextParams.tab = defaultMobileModuleId(role);
    }
    if (!isMobilePeriod(periodParam)) {
      nextParams.period = 'today';
    }
    if (Object.keys(nextParams).length > 0) {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (nextParams.tab) p.set('tab', nextParams.tab);
          if (nextParams.period) p.set('period', nextParams.period);
          return p;
        },
        { replace: true }
      );
    }
  }, [tabParam, periodParam, role, modules.length, setSearchParams]);

  const setActivePeriod = useCallback(
    (period: MobilePeriod) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('period', period);
          if (!p.get('tab')) p.set('tab', activeTab);
          return p;
        },
        { replace: true }
      );
    },
    [activeTab, setSearchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const tenantId = getTenantId();
    const today = todayYmd();
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

            const [daily, sales7, sales30, profit7, profit30, valuation, expiry] = await Promise.all([
              accountingApi.dailyReportSummary(today).catch(() => null),
              accountingApi.getSalesBySource(weeklyRange.fromIso, weeklyRange.toIso).catch(() => null),
              accountingApi.getSalesBySource(monthlyRange.fromIso, monthlyRange.toIso).catch(() => null),
              accountingApi.dailyProfitSummary(weeklyRange.dayKeys).catch(() => null),
              accountingApi.dailyProfitSummary(monthlyRange.dayKeys).catch(() => null),
              procurementApi.reports.inventoryValuation().catch(() => null),
              shopApi.getInventoryExpirySummary().catch(() => null),
            ]);
            next.dailyNetProfit = Number(daily?.netProfitDaily) || 0;
            next.dailyNetSales = Number(daily?.netTotalSales) || 0;
            next.periodWeekly = parsePeriodStatsFromSalesBySource(sales7);
            next.periodMonthly = parsePeriodStatsFromSalesBySource(sales30);
            if (profit7 && typeof profit7 === 'object') {
              next.profit7d = {
                totalProfit: Number(profit7.totalProfit) || 0,
                avgProfitPerDay: Number(profit7.avgProfitPerDay) || 0,
              };
            }
            if (profit30 && typeof profit30 === 'object') {
              next.profit30d = {
                totalProfit: Number(profit30.totalProfit) || 0,
                avgProfitPerDay: Number(profit30.avgProfitPerDay) || 0,
              };
            }
            const valItems = Array.isArray(valuation?.items) ? valuation.items : [];
            next.inventory = {
              stockValue: Number(valuation?.totalValue) || 0,
              totalSkus: valItems.length,
              lowStock: next.dashboard?.lowStockItems ?? 0,
              outOfStock: next.dashboard?.outOfStockItems ?? 0,
              expiring7: Number(expiry?.expiring_7_qty) || 0,
              expiring30: Number(expiry?.expiring_30_qty) || 0,
            };
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

      if (moduleIds.has('accounting')) {
        tasks.push(
          (async () => {
            const [summary, accountsRaw, bankRaw] = await Promise.all([
              accountingApi.getFinancialSummary().catch(() => ({})),
              accountingApi.getAccounts().catch(() => []),
              accountingApi.getBankBalances().catch(() => []),
            ]);
            const s = summary && typeof summary === 'object' ? summary : {};
            next.accounting = {
              summary: {
                totalRevenue: parseFloat(s.totalRevenue) || 0,
                grossProfit: parseFloat(s.grossProfit) || 0,
                netMargin: parseFloat(s.netMargin) || 0,
                netProfit: parseFloat(s.netProfit) || 0,
                receivablesTotal: parseFloat(s.receivablesTotal) || 0,
                customerAdvances: parseFloat(s.customerAdvances) || 0,
                inventoryValuation: parseFloat(s.inventoryValuation) || 0,
                totalAssets: parseFloat(s.totalAssets) || 0,
              },
              accounts: (Array.isArray(accountsRaw) ? accountsRaw : []).map((acc: any) => ({
                id: String(acc.id),
                code: String(acc.code || 'UNCODED'),
                name: String(acc.name || ''),
                type: String(acc.type || ''),
                balance: parseFloat(acc.balance) || 0,
              })),
              bankAccounts: (Array.isArray(bankRaw) ? bankRaw : []).map((acc: any) => ({
                id: String(acc.chart_account_id || acc.id),
                name: String(acc.name || acc.chart_name || 'Account'),
                code: String(acc.code || '—'),
                balance: parseFloat(acc.balance) || 0,
              })),
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
  }, [modules, todayYmd, timezone, weeklyRange, monthlyRange]);

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
    () => (activeModule ? tilesForModule(activeModule.id, data, activePeriod) : []),
    [activeModule, data, activePeriod]
  );

  const showInventorySummary = activeModule?.id === 'dashboard';
  const inventoryTiles = useMemo(() => inventorySummaryTiles(data), [data]);

  const periodSubtitle = useMemo(() => {
    if (activeModule?.id !== 'dashboard') return activeModule?.subtitle ?? '';
    switch (activePeriod) {
      case 'today':
        return "Today's sales, profit, and inventory snapshot";
      case 'weekly':
        return 'Last 7 days — sales, revenue, profit, and inventory';
      case 'monthly':
        return 'Last 30 days — sales, revenue, profit, and inventory';
      default:
        return activeModule?.subtitle ?? '';
    }
  }, [activeModule, activePeriod]);

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
                    {periodSubtitle}
                  </p>
                </div>
              </div>
            </div>

            {activeModule.id === 'dashboard' && (
              <MobilePeriodTabs active={activePeriod} onChange={setActivePeriod} />
            )}

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

            {showInventorySummary && (
              <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:border-gray-800 dark:bg-card">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#6C757D] dark:text-muted-foreground">
                    Inventory summary
                  </h3>
                </div>
                <MobileStatGrid tiles={inventoryTiles} loading={loading} />
              </section>
            )}

            {activeModule.id === 'accounting' && (
              <MobileAccountingPanel
                summary={data.accounting.summary}
                accounts={data.accounting.accounts}
                bankAccounts={data.accounting.bankAccounts}
                loading={loading}
              />
            )}

            <p className="pb-2 text-center text-[0.65rem] text-[#6C757D] dark:text-muted-foreground">
              Pull down or tap refresh to update · Switch modules from the bar below
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
