import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { accountingApi } from '../services/shopApi';
import { forecastApi } from '../services/forecastApi';
import { apiClient } from '../services/apiClient';

export interface StockOutRiskRow {
  product_name: string;
  stock_out_risk_percent: number;
  overstock_risk_percent: number;
  forecast_quantity: number;
  current_stock: number;
  stock_risk_level: string;
}

interface BIContextValue {
  salesData: any[];
  inventoryData: any[];
  profitabilityData: any[];
  kpis: any[];
  storePerformance: any[];
  storeRankings: any[];
  salesTrend: any[];
  categoryPerformance: any[];
  salesBySource: { pos: any; mobile: any } | null;
  recentTransactions: any[];
  stockOutRisks: StockOutRiskRow[];
  forecastNeedsRun: boolean;
  systemHealth: { status: string; database: string; uptimeSeconds?: number } | null;
  dateRange: string;
  setDateRange: (range: string) => void;
  loading: boolean;
  refreshData: () => Promise<void>;
  [key: string]: any;
}

const defaultValue: BIContextValue = {
  salesData: [], inventoryData: [], profitabilityData: [], kpis: [],
  storePerformance: [], storeRankings: [], salesTrend: [], categoryPerformance: [],
  salesBySource: null, recentTransactions: [],
  stockOutRisks: [], forecastNeedsRun: false, systemHealth: null,
  dateRange: 'MTD', setDateRange: () => { },
  loading: false, refreshData: async () => { },
};

const BIContext = createContext<BIContextValue>(defaultValue);

/** Calendar bounds for analytics filters (Today / MTD / QTD / YTD). */
export function analyticsPeriodBounds(range: string): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  let from: Date;
  if (range === 'Today') {
    from = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 0, 0, 0, 0);
  } else if (range === 'MTD') {
    from = new Date(to.getFullYear(), to.getMonth(), 1, 0, 0, 0, 0);
  } else if (range === 'QTD') {
    const q = Math.floor(to.getMonth() / 3) * 3;
    from = new Date(to.getFullYear(), q, 1, 0, 0, 0, 0);
  } else if (range === 'YTD') {
    from = new Date(to.getFullYear(), 0, 1, 0, 0, 0, 0);
  } else {
    from = new Date(to);
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

function priorPeriodSameLength(from: Date, to: Date): { from: Date; to: Date } {
  const lenMs = Math.max(0, to.getTime() - from.getTime());
  const priorTo = new Date(from.getTime() - 1);
  priorTo.setHours(23, 59, 59, 999);
  const priorFrom = new Date(priorTo.getTime() - lenMs);
  priorFrom.setHours(0, 0, 0, 0);
  return { from: priorFrom, to: priorTo };
}

function categoryExclusiveUpperBound(localDayEnd: Date): string {
  const d = new Date(localDayEnd.getFullYear(), localDayEnd.getMonth(), localDayEnd.getDate() + 1, 0, 0, 0, 0);
  return d.toISOString();
}

function dayKeyFromRow(day: unknown): string {
  if (day == null) return '';
  if (typeof day === 'string') {
    const m = day.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (day instanceof Date) {
    const y = day.getFullYear();
    const mo = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dd}`;
  }
  const s = String(day);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    const d = new Date(s);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dd}`;
  } catch {
    return s.slice(0, 10);
  }
}

/** Local calendar YYYY-MM-DD (matches eachCalendarDay iteration; avoids UTC drift from toISOString). */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dd}`;
}

function eachCalendarDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur.getTime() <= end.getTime()) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function pctVsPrior(cur: number, prev: number): { pct: number; status: 'up' | 'down' | 'flat' } {
  if (prev <= 0 && cur <= 0) return { pct: 0, status: 'flat' };
  if (prev <= 0) return { pct: 100, status: 'up' };
  const raw = ((cur - prev) / prev) * 100;
  const rounded = Math.min(999, Math.round(Math.abs(raw)));
  if (Math.abs(raw) < 0.5) return { pct: 0, status: 'flat' };
  return { pct: rounded, status: raw >= 0 ? 'up' : 'down' };
}

export function BIProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState('MTD');
  const [loading, setLoading] = useState(false);
  const [salesBySource, setSalesBySource] = useState<any>(null);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [categoryPerformance, setCategoryPerformance] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [storeRankings, setStoreRankings] = useState<any[]>([]);
  const [stockOutRisks, setStockOutRisks] = useState<StockOutRiskRow[]>([]);
  const [forecastNeedsRun, setForecastNeedsRun] = useState(false);
  const [systemHealth, setSystemHealth] = useState<BIContextValue['systemHealth']>(null);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = analyticsPeriodBounds(dateRange);
      const prior = priorPeriodSameLength(from, to);
      const fromIso = from.toISOString();
      const toIso = to.toISOString();
      const priorFromIso = prior.from.toISOString();
      const priorToIso = prior.to.toISOString();
      const catToIso = categoryExclusiveUpperBound(to);

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const [
        sourceData,
        priorSourceData,
        trendData,
        branchCurrent,
        branchPrior,
        catData,
        txData,
        forecastRes,
        healthRes,
      ] = await Promise.all([
        accountingApi.getSalesBySource(fromIso, toIso).catch(() => null),
        accountingApi.getSalesBySource(priorFromIso, priorToIso).catch(() => null),
        accountingApi.getDailyTrend({ from: fromIso, to: toIso }).catch(() => ({ pos: [], mobile: [] })),
        accountingApi.getBranchRevenue(fromIso, toIso).catch(() => []),
        accountingApi.getBranchRevenue(priorFromIso, priorToIso).catch(() => []),
        accountingApi.getCategoryPerformance(fromIso, catToIso).catch(() => []),
        accountingApi.getTransactions(50, fromIso, toIso).catch(() => []),
        forecastApi.getDashboard(month, year).catch(() => null),
        apiClient.get<{ status?: string; database?: string; uptimeSeconds?: number }>('/health').catch(() => null),
      ]);

      setSalesBySource(sourceData);
      setSystemHealth(
        healthRes && typeof healthRes === 'object'
          ? {
              status: String(healthRes.status ?? 'unknown'),
              database: String(healthRes.database ?? 'unknown'),
              uptimeSeconds:
                typeof healthRes.uptimeSeconds === 'number' ? healthRes.uptimeSeconds : undefined,
            }
          : null
      );

      setForecastNeedsRun(Boolean((forecastRes as any)?.needsRun));
      const risksRaw = (forecastRes as any)?.inventoryRisks;
      if (Array.isArray(risksRaw)) {
        setStockOutRisks(
          risksRaw.map((r: any) => ({
            product_name: String(r.product_name ?? 'Product'),
            stock_out_risk_percent: Number(r.stock_out_risk_percent) || 0,
            overstock_risk_percent: Number(r.overstock_risk_percent) || 0,
            forecast_quantity: Number(r.forecast_quantity) || 0,
            current_stock: Number(r.current_stock) || 0,
            stock_risk_level: String(r.stock_risk_level ?? ''),
          }))
        );
      } else {
        setStockOutRisks([]);
      }

      const posMap = new Map<string, number>();
      const mobileMap = new Map<string, number>();
      if (trendData?.pos) {
        for (const d of trendData.pos) {
          posMap.set(dayKeyFromRow(d.day), parseFloat(d.revenue) || 0);
        }
      }
      if (trendData?.mobile) {
        for (const d of trendData.mobile) {
          mobileMap.set(dayKeyFromRow(d.day), parseFloat(d.revenue) || 0);
        }
      }

      const mergedTrend = eachCalendarDay(from, to).map((d) => {
        const key = localDayKey(d);
        const posRevenue = posMap.get(key) || 0;
        const mobileRevenue = mobileMap.get(key) || 0;
        return {
          timestamp: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
          iso: key,
          revenue: posRevenue + mobileRevenue,
          posRevenue,
          mobileRevenue,
        };
      });
      setSalesTrend(mergedTrend);

      const catPerf = (catData || []).map((c: any) => ({
        category: c.category || 'Uncategorized',
        revenue: parseFloat(c.revenue) || 0,
        unitsSold: parseFloat(c.units_sold) || 0,
        totalSales: parseInt(c.total_sales) || 0,
        turnoverRate: ((parseFloat(c.units_sold) || 0) / Math.max(1, parseInt(c.total_sales) || 1)).toFixed(1),
      }));
      setCategoryPerformance(catPerf.length > 0 ? catPerf : defaultCategories());

      setRecentTransactions(txData || []);

      const totalPosRev = sourceData?.pos?.netRevenue ?? sourceData?.pos?.totalRevenue ?? 0;
      const totalReturnsPos = sourceData?.pos?.totalReturns ?? 0;
      const totalMobileRev = sourceData?.mobile?.totalRevenue || 0;
      const totalRev = Number(totalPosRev) + Number(totalMobileRev);
      const totalOrders = (sourceData?.pos?.totalOrders || 0) + (sourceData?.mobile?.totalOrders || 0);
      const avgOrderVal = totalOrders > 0 ? totalRev / totalOrders : 0;

      const priorPosRev = priorSourceData?.pos?.netRevenue ?? priorSourceData?.pos?.totalRevenue ?? 0;
      const priorReturnsPos = priorSourceData?.pos?.totalReturns ?? 0;
      const priorMobileRev = priorSourceData?.mobile?.totalRevenue || 0;
      const priorTotalRev = Number(priorPosRev) + Number(priorMobileRev);
      const priorOrders =
        (priorSourceData?.pos?.totalOrders || 0) + (priorSourceData?.mobile?.totalOrders || 0);
      const priorAov = priorOrders > 0 ? priorTotalRev / priorOrders : 0;

      const revTrend = pctVsPrior(totalRev, priorTotalRev);
      const retDelta = pctVsPrior(Number(totalReturnsPos), Number(priorReturnsPos));
      const retTrendDisplay =
        retDelta.status === 'flat'
          ? retDelta
          : retDelta.status === 'up'
            ? { pct: retDelta.pct, status: 'down' as const }
            : { pct: retDelta.pct, status: 'up' as const };
      const posTrendK = pctVsPrior(Number(totalPosRev), Number(priorPosRev));
      const mobTrend = pctVsPrior(Number(totalMobileRev), Number(priorMobileRev));
      const aovTrend = pctVsPrior(avgOrderVal, priorAov);

      const spark = mergedTrend.slice(-8).map((d) => Math.max(0, d.revenue || 0));

      setKpis([
        {
          label: 'TOTAL REVENUE (NET POS + MOBILE)',
          value: `${(totalRev / 1000).toFixed(1)}K`,
          trend: revTrend.pct,
          status: revTrend.status,
          subtext: 'VS PRIOR PERIOD',
          sparkline: spark.length ? spark : [0],
        },
        {
          label: 'POS RETURNS',
          value: `${(Number(totalReturnsPos) / 1000).toFixed(1)}K`,
          trend: retTrendDisplay.pct,
          status: retTrendDisplay.status,
          subtext: 'VS PRIOR PERIOD',
          sparkline: mergedTrend.slice(-8).map((d) => Math.max(0, (d.posRevenue || 0) * 0.05)),
        },
        {
          label: 'POS NET SALES',
          value: `${(Number(totalPosRev) / 1000).toFixed(1)}K`,
          trend: posTrendK.pct,
          status: posTrendK.status,
          subtext: 'VS PRIOR PERIOD',
          sparkline: mergedTrend.slice(-8).map((d) => Math.max(0, d.posRevenue || 0)),
        },
        {
          label: 'MOBILE REVENUE',
          value: `${(Number(totalMobileRev) / 1000).toFixed(1)}K`,
          trend: mobTrend.pct,
          status: mobTrend.status,
          subtext: 'VS PRIOR PERIOD',
          sparkline: mergedTrend.slice(-8).map((d) => Math.max(0, d.mobileRevenue || 0)),
        },
        {
          label: 'AVG. ORDER VALUE',
          value: Math.round(avgOrderVal).toLocaleString(),
          trend: aovTrend.pct,
          status: aovTrend.status,
          subtext: 'VS PRIOR PERIOD',
          sparkline: mergedTrend.slice(-8).map(() => avgOrderVal),
        },
      ]);

      const priorBranchMap = new Map<string, number>();
      for (const row of branchPrior as any[]) {
        priorBranchMap.set(String(row.branch_name ?? 'Unassigned'), Number(row.revenue) || 0);
      }
      const rankings = (branchCurrent as any[])
        .map((r) => {
          const name = String(r.branch_name ?? 'Unassigned');
          const revenue = Number(r.revenue) || 0;
          const prevRev = priorBranchMap.get(name) ?? 0;
          let growth = 0;
          if (prevRev > 0) growth = Math.round(((revenue - prevRev) / prevRev) * 100);
          else if (revenue > 0) growth = 100;
          return { storeName: name, revenue, growth };
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((r, i) => ({ ...r, rank: i + 1 }));
      setStoreRankings(rankings);
    } catch (error) {
      console.error('Failed to refresh BI data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const value: BIContextValue = {
    ...defaultValue,
    salesBySource,
    salesTrend,
    categoryPerformance,
    recentTransactions,
    kpis,
    storeRankings,
    stockOutRisks,
    forecastNeedsRun,
    systemHealth,
    dateRange,
    setDateRange,
    loading,
    refreshData,
  };

  return <BIContext.Provider value={value}>{children}</BIContext.Provider>;
}

export function useBI() {
  return useContext(BIContext);
}

function defaultCategories() {
  return [
    { category: 'No Sales Data', revenue: 0, unitsSold: 0, totalSales: 0, turnoverRate: '0' },
  ];
}
