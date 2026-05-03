/**
 * Local cache for weekly menu planner (IndexedDB). Used offline read path after last successful sync.
 */

const DB_NAME = 'myshop_menu_planner';
const DB_VERSION = 1;
const STORE = 'snapshots';

export interface CachedMenuSnapshot {
    shopSlug: string;
    menuId: string;
    payload: unknown;
    cachedAt: string;
}

export interface CachedShoppingSnapshot {
    shopSlug: string;
    listId: string;
    payload: unknown;
    cachedAt: string;
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
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE);
            }
        };
    });
}

function keyMenu(shopSlug: string, menuId: string) {
    return `menu:${shopSlug}:${menuId}`;
}

function keyList(shopSlug: string, listId: string) {
    return `list:${shopSlug}:${listId}`;
}

export async function cacheMenuDetail(shopSlug: string, menuId: string, payload: unknown): Promise<void> {
    const db = await openDb();
    const rec: CachedMenuSnapshot = { shopSlug, menuId, payload, cachedAt: new Date().toISOString() };
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec, keyMenu(shopSlug, menuId));
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

export async function getCachedMenuDetail(shopSlug: string, menuId: string): Promise<CachedMenuSnapshot | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(keyMenu(shopSlug, menuId));
        req.onsuccess = () => {
            db.close();
            resolve((req.result as CachedMenuSnapshot) || null);
        };
        req.onerror = () => {
            db.close();
            reject(req.error);
        };
    });
}

export async function cacheShoppingList(shopSlug: string, listId: string, payload: unknown): Promise<void> {
    const db = await openDb();
    const rec: CachedShoppingSnapshot = { shopSlug, listId, payload, cachedAt: new Date().toISOString() };
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec, keyList(shopSlug, listId));
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

export async function getCachedShoppingList(shopSlug: string, listId: string): Promise<CachedShoppingSnapshot | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(keyList(shopSlug, listId));
        req.onsuccess = () => {
            db.close();
            resolve((req.result as CachedShoppingSnapshot) || null);
        };
        req.onerror = () => {
            db.close();
            reject(req.error);
        };
    });
}
