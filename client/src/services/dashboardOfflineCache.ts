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

function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Fetch dashboard data from API and write to cache. Call when back online. */
export async function refreshDashboardCache(tenantId: string): Promise<void> {
  try {
    const { shopApi } = await import('./shopApi');
    const { mobileOrdersApi } = await import('./mobileOrdersApi');
    const { getShopCategoriesOfflineFirst } = await import('./categoriesOfflineCache');
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
    ]);
    const salesList = (sales as any[]) || [];
    const totalRevenue = salesList.reduce(
      (sum: number, s: any) => sum + parseFloat(s.grandTotal ?? s.grand_total ?? 0),
      0
    );
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
    const stats: DashboardStats = {
      totalProducts: (products as any[]).length,
      totalSales: totalSalesCount,
      totalRevenue,
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
    await setDashboardCache(tenantId, stats);
  } catch {
    // ignore
  }
}
