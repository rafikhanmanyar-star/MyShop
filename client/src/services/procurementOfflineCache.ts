/**
 * Offline cache for procurement data (POS). Read/write IndexedDB so procurement
 * lists and reports can be viewed when offline.
 */

import { openPosOfflineDb, getTenantId } from './posOfflineDb';

const STORE_NAME = 'procurement';

export interface ProcurementCacheData {
  purchaseBills?: any[];
  supplierPayments?: any[];
  supplierLedger?: any; // keyed by supplierId in cache key
  apAging?: any;
  inventoryValuation?: any;
}

export interface CachedProcurement {
  data: ProcurementCacheData;
  cachedAt: string;
}

function cacheKey(tenantId: string, subKey?: string): string {
  return subKey ? `${tenantId}_${subKey}` : tenantId;
}

export async function setProcurementCache(
  tenantId: string,
  data: ProcurementCacheData,
  subKey?: string
): Promise<void> {
  const db = await openPosOfflineDb();
  const key = cacheKey(tenantId, subKey);
  const payload: CachedProcurement = { data, cachedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(payload, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getProcurementCache(
  tenantId: string,
  subKey?: string
): Promise<CachedProcurement | null> {
  const db = await openPosOfflineDb();
  const key = cacheKey(tenantId, subKey);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as CachedProcurement) || null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export { getTenantId };
