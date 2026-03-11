/**
 * Offline pending procurement mutations (POS): queue create purchase bill and
 * record supplier payment when offline; sync when back online.
 */

import { openPosOfflineDb } from './posOfflineDb';

const STORE_NAME = 'pending_procurement';

export type PendingProcurementAction = 'create_purchase_bill' | 'record_supplier_payment';

export interface PendingProcurementItem {
  localId: string;
  action: PendingProcurementAction;
  payload: any;
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
}

function generateLocalId(): string {
  return `pos-proc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function addPendingProcurement(
  item: Omit<PendingProcurementItem, 'localId' | 'createdAt' | 'status'>
): Promise<string> {
  const db = await openPosOfflineDb();
  const localId = generateLocalId();
  const full: PendingProcurementItem = {
    ...item,
    localId,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(full, localId);
    tx.oncomplete = () => { db.close(); resolve(localId); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAllPendingProcurement(): Promise<PendingProcurementItem[]> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      db.close();
      const items = (req.result as PendingProcurementItem[]).filter(
        (i) => i.status === 'pending' || i.status === 'failed'
      );
      resolve(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function setPendingProcurementStatus(
  localId: string,
  status: PendingProcurementItem['status'],
  error?: string
): Promise<void> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingProcurementItem | undefined;
      if (!item) { db.close(); resolve(); return; }
      item.status = status;
      if (error != null) item.error = error;
      store.put(item, localId);
      tx.oncomplete = () => { db.close(); resolve(); };
    };
    getReq.onerror = () => { db.close(); reject(getReq.error); };
  });
}

export async function removePendingProcurement(localId: string): Promise<void> {
  const db = await openPosOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(localId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
