/**
 * Offline pending products (new SKU) queue: IndexedDB store for product/SKU
 * creations when offline. Synced to API when back online.
 *
 * PERMANENT LOCAL DB: We do not clear this DB on app exit or reload. The only
 * removals are individual pending product records after they have been
 * successfully synced to the cloud. All other local data remains.
 */

const DB_NAME = 'myshop_product_sync';
const STORE_NAME = 'pending_products';
const IMAGE_STORE = 'localImageBlobs';
const DB_VERSION = 2;

export interface PendingProductPayload {
    name: string;
    sku: string;
    price: number;
    /** When creating product offline with image, set after saving blob via saveLocalImageBlob */
    localImageId?: string;
    [key: string]: unknown;
}

export interface PendingProductItem {
    localId: string;
    shopSlug: string;
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
    return `product-local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function addPendingProduct(shopSlug: string, payload: PendingProductPayload): Promise<string> {
    const db = await openDb();
    const localId = generateLocalId();
    const item: PendingProductItem = {
        localId,
        shopSlug,
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

export async function getAllPendingProducts(): Promise<PendingProductItem[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
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
            if (!item) {
                db.close();
                resolve();
                return;
            }
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
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(localId);
        req.onsuccess = () => { db.close(); resolve(); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

export async function getPendingProductCount(): Promise<number> {
    const items = await getAllPendingProducts();
    return items.length;
}

// ─── Local image blobs (for offline-created products with image; uploaded when syncing) ───

function generateImageId(): string {
    return `img-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Save image blob for a pending product. Returns localImageId to put in payload.localImageId. */
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

/** Get image blob by localImageId. Used when syncing to upload to cloud. */
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

/** Remove local image blob after successful upload (frees space; image is on cloud). */
export async function removeLocalImageBlob(localImageId: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IMAGE_STORE, 'readwrite');
        const req = tx.objectStore(IMAGE_STORE).delete(localImageId);
        req.onsuccess = () => { db.close(); resolve(); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}
