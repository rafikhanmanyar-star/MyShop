/**
 * Shared IndexedDB for POS offline mode. Single DB (myshop_pos_offline) with
 * multiple object stores. All caches and sync queues use this DB.
 */

export const POS_OFFLINE_DB_NAME = 'myshop_pos_offline';
export const POS_OFFLINE_DB_VERSION = 2;

const STORES = [
  'categories',
  'dashboard',
  'branches',
  'terminals',
  'accounting',
  'pending_accounting',
  'procurement',
  'pending_procurement',
  'pending_categories',
] as const;

export function openPosOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(POS_OFFLINE_DB_NAME, POS_OFFLINE_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
  });
}

export function getTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tenant_id');
}
