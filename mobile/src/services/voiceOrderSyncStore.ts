const DB_NAME = 'myshop_voice_order_sync';
const STORE = 'pending_voice_orders';
const DB_VERSION = 1;

export interface PendingVoiceOrder {
    localId: string;
    shopSlug: string;
    meta: {
        branchId?: string;
        notes?: string;
        deliveryMode: 'delivery' | 'pickup';
        deliveryAddress?: string;
        deliveryLat?: number;
        deliveryLng?: number;
        audioDurationSeconds: number;
    };
    audioBlob: Blob;
    audioMime: string;
    createdAt: string;
    status: 'pending' | 'syncing' | 'failed';
    serverOrderId?: string;
    error?: string;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'localId' });
        };
    });
}

export async function queueVoiceOrder(item: Omit<PendingVoiceOrder, 'localId' | 'createdAt' | 'status'>): Promise<string> {
    const db = await openDb();
    const localId = `vo-local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const row: PendingVoiceOrder = { ...item, localId, createdAt: new Date().toISOString(), status: 'pending' };
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add(row);
        tx.oncomplete = () => { db.close(); resolve(localId); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function getPendingVoiceOrders(): Promise<PendingVoiceOrder[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => { db.close(); resolve(req.result || []); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

export async function removePendingVoiceOrder(localId: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(localId);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function updatePendingVoiceOrder(localId: string, patch: Partial<PendingVoiceOrder>): Promise<void> {
    const db = await openDb();
    const all = await getPendingVoiceOrders();
    const cur = all.find((x) => x.localId === localId);
    if (!cur) return;
    const next = { ...cur, ...patch };
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(next);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}
