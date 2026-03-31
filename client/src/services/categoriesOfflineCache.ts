/**
 * Offline cache for shop categories (POS). Read/write IndexedDB so categories
 * can be selected and used when offline.
 */

import { shopApi, type ShopProductCategory } from './shopApi';
import { openPosOfflineDb, getTenantId } from './posOfflineDb';

const STORE_NAME = 'categories';

/** When `tenant_id` is missing from localStorage but the user has a valid session token (JWT). */
function getTenantIdFromAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('auth_token');
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1])) as { tenantId?: string };
    return typeof payload.tenantId === 'string' ? payload.tenantId : null;
  } catch {
    return null;
  }
}

export interface CachedCategories {
  items: ShopProductCategory[];
  cachedAt?: string;
}

export async function setCategories(tenantId: string, items: ShopProductCategory[]): Promise<void> {
  const db = await openPosOfflineDb();
  const payload: CachedCategories = { items, cachedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(payload, tenantId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getCachedCategories(tenantId: string): Promise<CachedCategories | null> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(tenantId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as CachedCategories) || null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * Get shop categories: fetch from API when online and cache; when offline or
 * on failure, return cached list. Uses getTenantId() for cache key.
 */
export async function getShopCategoriesOfflineFirst(): Promise<ShopProductCategory[]> {
  const tenantId = getTenantId() || getTenantIdFromAuthToken();
  if (!tenantId) return [];

  const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
  if (isOnline) {
    try {
      const list = await shopApi.getShopCategories();
      const items = Array.isArray(list) ? list : [];
      await setCategories(tenantId, items);
      return items;
    } catch {
      const cached = await getCachedCategories(tenantId);
      return cached?.items ?? [];
    }
  }

  const cached = await getCachedCategories(tenantId);
  return cached?.items ?? [];
}
