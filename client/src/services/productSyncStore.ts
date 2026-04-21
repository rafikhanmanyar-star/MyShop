/**
 * Offline pending products (POS): queue product/SKU creations when offline.
 * Images are stored locally and uploaded when syncing to cloud.
 */

const DB_NAME = 'myshop_pos_product_sync';
const STORE_NAME = 'pending_products';
const IMAGE_STORE = 'localImageBlobs';
const DB_VERSION = 1;

export interface PendingProductPayload {
  sku: string;
  barcode?: string | null;
  name: string;
  category_id: string | null;
  subcategory_id?: string | null;
  retail_price: number;
  cost_price: number;
  unit: string;
  reorder_point: number;
  description?: string | null;
  brand?: string | null;
  weight?: number | null;
  weight_unit?: string | null;
  size?: string | null;
  color?: string | null;
  material?: string | null;
  origin_country?: string | null;
  attributes?: Record<string, string | number | boolean> | null;
  localImageId?: string;
}

export interface PendingProductItem {
  localId: string;
  payload: PendingProductPayload;
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  serverProductId?: string;
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
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE, { keyPath: 'localImageId' });
      }
    };
  });
}

function generateLocalId(): string {
  return `pos-product-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
function generateImageId(): string {
  return `pos-img-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function saveLocalImageBlob(blob: Blob): Promise<string> {
  const db = await openDb();
  const localImageId = generateImageId();
  const buffer = await blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    tx.objectStore(IMAGE_STORE).put({ localImageId, buffer, createdAt: new Date().toISOString() });
    tx.oncomplete = () => { db.close(); resolve(localImageId); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getLocalImageBlob(localImageId: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, 'readonly');
    const req = tx.objectStore(IMAGE_STORE).get(localImageId);
    req.onsuccess = () => {
      db.close();
      const row = req.result as { buffer: ArrayBuffer } | undefined;
      resolve(row?.buffer ? new Blob([row.buffer]) : null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function removeLocalImageBlob(localImageId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    tx.objectStore(IMAGE_STORE).delete(localImageId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function addPendingProduct(payload: PendingProductPayload): Promise<string> {
  const db = await openDb();
  const localId = generateLocalId();
  const item: PendingProductItem = {
    localId,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(item);
    tx.oncomplete = () => { db.close(); resolve(localId); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAllPendingProducts(): Promise<PendingProductItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      db.close();
      const items = (req.result as PendingProductItem[]).filter(
        (i) => i.status === 'pending' || i.status === 'failed'
      );
      resolve(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function setProductStatus(
  localId: string,
  status: PendingProductItem['status'],
  serverProductId?: string,
  error?: string
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingProductItem | undefined;
      if (!item) { db.close(); resolve(); return; }
      item.status = status;
      if (serverProductId != null) item.serverProductId = serverProductId;
      if (error != null) item.error = error;
      store.put(item);
      tx.oncomplete = () => { db.close(); resolve(); };
    };
    getReq.onerror = () => { db.close(); reject(getReq.error); };
  });
}

export async function removePendingProduct(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(localId);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
