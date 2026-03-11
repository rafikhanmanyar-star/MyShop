/**
 * Offline cache for accounting data (POS). Read/write IndexedDB so accounting
 * can be viewed when offline.
 */

import { openPosOfflineDb, getTenantId } from './posOfflineDb';

const STORE_NAME = 'accounting';

export interface AccountingCacheData {
  accounts: any[];
  journalEntries: any[];
  summary: any;
  bankBalances: any[];
  salesBySource: any;
}

export interface CachedAccounting {
  data: AccountingCacheData;
  cachedAt: string;
}

export async function setAccountingCache(tenantId: string, data: AccountingCacheData): Promise<void> {
  const db = await openPosOfflineDb();
  const payload: CachedAccounting = { data, cachedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(payload, tenantId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAccountingCache(tenantId: string): Promise<CachedAccounting | null> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(tenantId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as CachedAccounting) || null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
