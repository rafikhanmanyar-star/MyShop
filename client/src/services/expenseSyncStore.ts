/**
 * Offline-first expense queue: IndexedDB store for pending expenses
 * when the app is offline or the API request fails.
 */

const DB_NAME = 'myshop_expense_sync';
const STORE_NAME = 'pending';
const DB_VERSION = 1;

export interface PendingExpenseItem {
  localId: string;
  payload: {
    expenseDate: string;
    categoryId: string;
    amount: number;
    paymentMethod: 'Cash' | 'Bank' | 'Credit';
    payeeName?: string;
    vendorId?: string;
    description?: string;
    attachmentUrl?: string;
    branchId?: string;
    referenceNumber?: string;
    taxAmount?: number;
    paymentAccountId?: string;
  };
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  serverId?: string;
  error?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
      }
    };
  });
}

function generateLocalId(): string {
  return `exp-local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function addPending(payload: PendingExpenseItem['payload']): Promise<string> {
  const db = await openDb();
  const localId = generateLocalId();
  const item: PendingExpenseItem = {
    localId,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(item);
    req.onsuccess = () => { db.close(); resolve(localId); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function getAllPending(): Promise<PendingExpenseItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      const items = (req.result as PendingExpenseItem[]).filter(
        (i) => i.status === 'pending' || i.status === 'failed'
      );
      resolve(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function setStatus(
  localId: string,
  status: PendingExpenseItem['status'],
  serverId?: string,
  error?: string
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingExpenseItem | undefined;
      if (!item) {
        db.close();
        resolve();
        return;
      }
      item.status = status;
      if (serverId != null) item.serverId = serverId;
      if (error != null) item.error = error;
      store.put(item);
      tx.oncomplete = () => { db.close(); resolve(); };
    };
    getReq.onerror = () => { db.close(); reject(getReq.error); };
  });
}

export async function removePending(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(localId);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function getPendingCount(): Promise<number> {
  const items = await getAllPending();
  return items.length;
}
