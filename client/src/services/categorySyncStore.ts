/**
 * Offline pending category creations (POS): queue when offline, sync when online.
 */

import { openPosOfflineDb } from './posOfflineDb';

const STORE_NAME = 'pending_categories';

export interface PendingCategoryItem {
  localId: string;
  name: string;
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  serverId?: string;
  error?: string;
}

function generateLocalId(): string {
  return `pos-cat-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function addPendingCategory(name: string): Promise<string> {
  const db = await openPosOfflineDb();
  const localId = generateLocalId();
  const item: PendingCategoryItem = {
    localId,
    name,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item, localId);
    tx.oncomplete = () => { db.close(); resolve(localId); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAllPendingCategories(): Promise<PendingCategoryItem[]> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      db.close();
      const items = (req.result as PendingCategoryItem[]).filter(
        (i) => i.status === 'pending' || i.status === 'failed'
      );
      resolve(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function setPendingCategoryStatus(
  localId: string,
  status: PendingCategoryItem['status'],
  serverId?: string,
  error?: string
): Promise<void> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingCategoryItem | undefined;
      if (!item) { db.close(); resolve(); return; }
      item.status = status;
      if (serverId != null) item.serverId = serverId;
      if (error != null) item.error = error;
      store.put(item, localId);
      tx.oncomplete = () => { db.close(); resolve(); };
    };
    getReq.onerror = () => { db.close(); reject(getReq.error); };
  });
}

export async function removePendingCategory(localId: string): Promise<void> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(localId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
