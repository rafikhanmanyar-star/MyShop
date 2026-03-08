/**
 * Local image cache: store product/SKU images in IndexedDB so they load offline.
 * Data is kept permanently; we never clear on app exit or reload.
 * When online, images can be fetched and cached; when offline, we use cached blobs.
 */

const DB_NAME = 'myshop_image_cache';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

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
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

/** Normalize path to a cache key (e.g. /uploads/product/abc.jpg). */
function toKey(path: string | undefined): string {
    if (!path) return '';
    return path.startsWith('/') ? path : `/${path}`;
}

/** Store an image blob by path. Permanently kept until overwritten. */
export async function setImageBlob(path: string | undefined, blob: Blob): Promise<void> {
    const key = toKey(path);
    if (!key) return;
    const db = await openDb();
    const buffer = await blob.arrayBuffer();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ buffer, cachedAt: new Date().toISOString() }, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Get cached image blob by path, or null if not cached. */
export async function getImageBlob(path: string | undefined): Promise<Blob | null> {
    const key = toKey(path);
    if (!key) return null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => {
            db.close();
            const row = req.result as { buffer: ArrayBuffer } | undefined;
            resolve(row?.buffer ? new Blob([row.buffer]) : null);
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

/** Fetch image from remote URL and cache it. Call when online to prefill cache. */
export async function fetchAndCacheImage(fullUrl: string, pathForCache: string): Promise<void> {
    try {
        const res = await fetch(fullUrl);
        if (!res.ok) return;
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) {
            await setImageBlob(pathForCache, blob);
        }
    } catch {
        // ignore
    }
}
