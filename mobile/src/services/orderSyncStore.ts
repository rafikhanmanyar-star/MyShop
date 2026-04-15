/**
 * Offline order queue: IndexedDB store for pending orders when offline.
 * Synced to API when back online.
 *
 * PERMANENT LOCAL DB: We do not clear this DB on app exit or reload. The only
 * removals are individual pending order records after they have been successfully
 * synced to the cloud (to avoid duplicate orders). All other local data remains.
 */

const DB_NAME = 'myshop_order_sync';
const STORE_NAME = 'pending_orders';
const DB_VERSION = 1;

export interface PendingOrderPayload {
    items: Array<{ productId: string; quantity: number }>;
    offerBundles?: Array<{ offerId: string; quantity: number }>;
    deliveryAddress: string;
    /** Customer GPS — stored on mobile_orders as delivery_lat / delivery_lng */
    deliveryLat?: number;
    deliveryLng?: number;
    deliveryNotes?: string;
    paymentMethod: string;
    idempotencyKey: string;
    branchId?: string;
}

export interface PendingOrderItem {
    localId: string;
    shopSlug: string;
    payload: PendingOrderPayload;
    createdAt: string;
    status: 'pending' | 'syncing' | 'synced' | 'failed';
    serverOrderId?: string;
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
    return `order-local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function addPendingOrder(shopSlug: string, payload: PendingOrderPayload): Promise<string> {
    const db = await openDb();
    const localId = generateLocalId();
    const item: PendingOrderItem = {
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

export async function getAllPendingOrders(): Promise<PendingOrderItem[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
            db.close();
            const items = (req.result as PendingOrderItem[]).filter(
                (i) => i.status === 'pending' || i.status === 'failed'
            );
            resolve(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

export async function setOrderStatus(
    localId: string,
    status: PendingOrderItem['status'],
    serverOrderId?: string,
    error?: string
): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(localId);
        getReq.onsuccess = () => {
            const item = getReq.result as PendingOrderItem | undefined;
            if (!item) {
                db.close();
                resolve();
                return;
            }
            item.status = status;
            if (serverOrderId != null) item.serverOrderId = serverOrderId;
            if (error != null) item.error = error;
            store.put(item);
            tx.oncomplete = () => { db.close(); resolve(); };
        };
        getReq.onerror = () => { db.close(); reject(getReq.error); };
    });
}

export async function removePendingOrder(localId: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(localId);
        req.onsuccess = () => { db.close(); resolve(); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

export async function getPendingOrderCount(): Promise<number> {
    const items = await getAllPendingOrders();
    return items.length;
}
