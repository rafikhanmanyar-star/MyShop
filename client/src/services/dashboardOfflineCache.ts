/**
 * Offline cache for dashboard stats (POS). Read/write IndexedDB so dashboard
 * can show last-known stats when offline.
 */

import { openPosOfflineDb, getTenantId } from './posOfflineDb';

const STORE_NAME = 'dashboard';

export interface DashboardStats {
  totalProducts: number;
  totalSales: number;
  totalRevenue: number;
  /** Sum of shop_sales_returns.total_return_amount (all time; approximates returns volume) */
  totalReturns: number;
  /** totalRevenue − totalReturns (approximate net over sales list + returns) */
  netRevenue: number;
  totalCustomers: number;
  lowStockItems: number;
  outOfStockItems: number;
  branchesCount: number;
  terminalsCount: number;
  categoriesCount: number;
  vendorsCount: number;
  todaySalesCount: number;
  todayRevenue: number;
  avgOrderValue: number;
  mobileOrdersPending: number;
}

export interface CachedDashboard {
  stats: DashboardStats;
  cachedAt: string;
}

export async function setDashboardCache(tenantId: string, stats: DashboardStats): Promise<void> {
  const db = await openPosOfflineDb();
  const payload: CachedDashboard = { stats, cachedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(payload, tenantId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getDashboardCache(tenantId: string): Promise<CachedDashboard | null> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(tenantId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as CachedDashboard) || null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Fetch dashboard data from API and write to cache. Call when back online. */
export async function refreshDashboardCache(tenantId: string): Promise<void> {
  try {
    const { shopApi } = await import('./shopApi');
    const overview = await shopApi.getDashboardOverview();
    await setDashboardCache(tenantId, overview.stats);
  } catch {
    // ignore
  }
}
