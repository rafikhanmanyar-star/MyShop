/**
 * Offline cache for branches and terminals (Cashier dashboard). Read/write
 * IndexedDB so start-shift form can show last-known options when offline.
 */

import { openPosOfflineDb, getTenantId } from './posOfflineDb';

const BRANCHES_STORE = 'branches';
const TERMINALS_STORE = 'terminals';

export async function setBranchesCache(tenantId: string, branches: any[]): Promise<void> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BRANCHES_STORE, 'readwrite');
    tx.objectStore(BRANCHES_STORE).put({ items: branches, cachedAt: new Date().toISOString() }, tenantId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getBranchesCache(tenantId: string): Promise<any[] | null> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BRANCHES_STORE, 'readonly');
    const req = tx.objectStore(BRANCHES_STORE).get(tenantId);
    req.onsuccess = () => {
      db.close();
      const row = req.result as { items: any[] } | undefined;
      resolve(row?.items ?? null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function setTerminalsCache(tenantId: string, terminals: any[]): Promise<void> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TERMINALS_STORE, 'readwrite');
    tx.objectStore(TERMINALS_STORE).put({ items: terminals, cachedAt: new Date().toISOString() }, tenantId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getTerminalsCache(tenantId: string): Promise<any[] | null> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TERMINALS_STORE, 'readonly');
    const req = tx.objectStore(TERMINALS_STORE).get(tenantId);
    req.onsuccess = () => {
      db.close();
      const row = req.result as { items: any[] } | undefined;
      resolve(row?.items ?? null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export { getTenantId };
