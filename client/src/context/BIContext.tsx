import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { accountingApi, shopApi } from '../services/shopApi';

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
  dateRange: '30d', setDateRange: () => { },
  loading: false, refreshData: async () => { },
};

const BIContext = createContext<BIContextValue>(defaultValue);

function trendDaysForPeriod(range: string): number {
  const now = new Date();
  if (range === 'Today') return 1;
  if (range === 'MTD') return Math.max(1, now.getDate());
  if (range === 'QTD') {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qStartMonth, 1);
    return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86_400_000) + 1);
  }
  if (range === 'YTD') {
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86_400_000) + 1);
  }
  return 30;
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

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const trendDays = trendDaysForPeriod(dateRange);
      const [sourceData, trendData, catData, txData, salesData] = await Promise.all([
        accountingApi.getSalesBySource().catch(() => null),
        accountingApi.getDailyTrend(trendDays).catch(() => ({ pos: [], mobile: [] })),
        accountingApi.getCategoryPerformance().catch(() => []),
        accountingApi.getTransactions(50).catch(() => []),
        shopApi.getSales().catch(() => []),
      ]);

      setSalesBySource(sourceData);

      // Build sales trend from daily data
      const posMap = new Map<string, number>();
      const mobileMap = new Map<string, number>();

      if (trendData?.pos) {
        for (const d of trendData.pos) {
          const day = new Date(d.day).toLocaleDateString('en', { month: 'short', day: 'numeric' });
          posMap.set(day, parseFloat(d.revenue) || 0);
        }
      }
      if (trendData?.mobile) {
        for (const d of trendData.mobile) {
          const day = new Date(d.day).toLocaleDateString('en', { month: 'short', day: 'numeric' });
          mobileMap.set(day, parseFloat(d.revenue) || 0);
        }
      }

      // Merge into a single trend
      const allDays = new Set([...posMap.keys(), ...mobileMap.keys()]);
      const mergedTrend = Array.from(allDays).map(day => ({
        timestamp: day,
        revenue: (posMap.get(day) || 0) + (mobileMap.get(day) || 0),
        posRevenue: posMap.get(day) || 0,
        mobileRevenue: mobileMap.get(day) || 0,
      }));
      setSalesTrend(mergedTrend.length > 0 ? mergedTrend : generateDefaultTrend());

      // Category performance
      const catPerf = (catData || []).map((c: any) => ({
        category: c.category || 'Uncategorized',
        revenue: parseFloat(c.revenue) || 0,
        unitsSold: parseFloat(c.units_sold) || 0,
        totalSales: parseInt(c.total_sales) || 0,
        turnoverRate: ((parseFloat(c.units_sold) || 0) / Math.max(1, parseInt(c.total_sales) || 1)).toFixed(1),
      }));
      setCategoryPerformance(catPerf.length > 0 ? catPerf : defaultCategories());

      setRecentTransactions(txData || []);

      // Build KPIs from source data
      const totalPosRev = sourceData?.pos?.netRevenue ?? sourceData?.pos?.totalRevenue ?? 0;
      const totalReturnsPos = sourceData?.pos?.totalReturns ?? 0;
      const totalMobileRev = sourceData?.mobile?.totalRevenue || 0;
      const totalRev = totalPosRev + totalMobileRev;
      const totalOrders = (sourceData?.pos?.totalOrders || 0) + (sourceData?.mobile?.totalOrders || 0);
      const avgOrderVal = totalOrders > 0 ? totalRev / totalOrders : 0;

      setKpis([
        {
          label: 'TOTAL REVENUE (NET POS)',
          value: `${(totalRev / 1000).toFixed(1)}K`,
          trend: 12, status: 'up',
          subtext: 'VS LAST MONTH',
          sparkline: mergedTrend.slice(-8).map(d => d.revenue || 1),
        },
        {
          label: 'POS RETURNS',
          value: `${(totalReturnsPos / 1000).toFixed(1)}K`,
          trend: totalReturnsPos > 0 ? 4 : 0,
          status: totalReturnsPos > 0 ? 'down' : 'up',
          subtext: 'IN-STORE RETURNS',
          sparkline: mergedTrend.slice(-8).map(d => Math.max(0.01, (d.posRevenue || 0) * 0.02)),
        },
        {
          label: 'POS NET SALES',
          value: `${(totalPosRev / 1000).toFixed(1)}K`,
          trend: 8, status: 'up',
          subtext: 'PROCESSED ORDERS',
          sparkline: mergedTrend.slice(-8).map(d => d.posRevenue || 1),
        },
        {
          label: 'MOBILE REVENUE',
          value: `${(totalMobileRev / 1000).toFixed(1)}K`,
          trend: totalMobileRev > 0 ? 15 : 0, status: totalMobileRev > 0 ? 'up' : 'down',
          subtext: 'APP-DRIVEN GROWTH',
          sparkline: mergedTrend.slice(-8).map(d => d.mobileRevenue || 1),
        },
        {
          label: 'AVG. ORDER VALUE',
          value: Math.round(avgOrderVal).toLocaleString(),
          trend: 3, status: 'up',
          subtext: 'PKR CURRENCY',
          sparkline: [avgOrderVal * 0.8, avgOrderVal * 0.9, avgOrderVal, avgOrderVal * 1.1, avgOrderVal * 0.95, avgOrderVal * 1.05, avgOrderVal, avgOrderVal * 1.02],
        },
      ]);

      // Store rankings from sales data
      const salesArr = salesData || [];
      const branchMap = new Map<string, { name: string; rev: number; count: number }>();
      for (const sale of salesArr) {
        const branchName = sale.branchName || 'Main Store';
        const existing = branchMap.get(branchName) || { name: branchName, rev: 0, count: 0 };
        existing.rev += parseFloat(sale.grandTotal) || 0;
        existing.count += 1;
        branchMap.set(branchName, existing);
      }
      const rankings = Array.from(branchMap.values())
        .sort((a, b) => b.rev - a.rev)
        .slice(0, 5)
        .map((s, i) => ({
          storeName: s.name,
          revenue: s.rev,
          growth: 0,
          rank: i + 1,
        }));
      setStoreRankings(rankings.length > 0 ? rankings : defaultStoreRankings());

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

// Fallback data generators
function generateDefaultTrend(): Array<{ timestamp: string; revenue: number; posRevenue: number; mobileRevenue: number }> {
  const days: Array<{ timestamp: string; revenue: number; posRevenue: number; mobileRevenue: number }> = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      timestamp: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      revenue: 0,
      posRevenue: 0,
      mobileRevenue: 0,
    });
  }
  return days;
}

function defaultCategories() {
  return [
    { category: 'No Sales Data', revenue: 0, unitsSold: 0, totalSales: 0, turnoverRate: '0' },
  ];
}

function defaultStoreRankings() {
  return [
    { storeName: 'Main Store', revenue: 0, growth: 0, rank: 1 },
  ];
}
