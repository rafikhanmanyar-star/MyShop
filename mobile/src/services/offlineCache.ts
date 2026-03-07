/**
 * Offline cache: IndexedDB store for discover, shop info, full product catalog
 * (products, categories, brands) per shop. Used when offline or API fails.
 */

const DB_NAME = 'myshop_offline';
const DB_VERSION = 1;
const STORES = ['discover', 'shops', 'products', 'categories', 'brands'] as const;

export type OfflineStoreName = (typeof STORES)[number];

export interface CachedDiscover {
    shops: Array<{ slug: string; company_name: string; logo_url: string | null; brand_color: string }>;
    redirect?: string;
    cachedAt: string;
}

export interface CachedShop {
    shop: import('../context/AppContext').ShopInfo;
    settings: import('../context/AppContext').ShopSettings;
    branding: import('../context/AppContext').TenantBranding;
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
            STORES.forEach((name) => {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name);
                }
            });
        };
    });
}

const DISCOVER_KEY = 'data';

export async function setDiscover(data: Omit<CachedDiscover, 'cachedAt'>): Promise<void> {
    const db = await openDb();
    const payload: CachedDiscover = { ...data, cachedAt: new Date().toISOString() };
    return new Promise((resolve, reject) => {
        const tx = db.transaction('discover', 'readwrite');
        tx.objectStore('discover').put(payload, DISCOVER_KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function getDiscover(): Promise<CachedDiscover | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('discover', 'readonly');
        const req = tx.objectStore('discover').get(DISCOVER_KEY);
        req.onsuccess = () => { db.close(); resolve((req.result as CachedDiscover) || null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

export async function setShop(shopSlug: string, data: Omit<CachedShop, 'cachedAt'>): Promise<void> {
    const db = await openDb();
    const payload: CachedShop = { ...data, cachedAt: new Date().toISOString() };
    return new Promise((resolve, reject) => {
        const tx = db.transaction('shops', 'readwrite');
        tx.objectStore('shops').put(payload, shopSlug);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function getShop(shopSlug: string): Promise<CachedShop | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('shops', 'readonly');
        const req = tx.objectStore('shops').get(shopSlug);
        req.onsuccess = () => { db.close(); resolve((req.result as CachedShop) || null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

export async function setProducts(shopSlug: string, items: any[]): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('products', 'readwrite');
        tx.objectStore('products').put({ items, cachedAt: new Date().toISOString() }, shopSlug);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function getProducts(shopSlug: string): Promise<{ items: any[]; cachedAt?: string } | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('products', 'readonly');
        const req = tx.objectStore('products').get(shopSlug);
        req.onsuccess = () => { db.close(); resolve((req.result as { items: any[]; cachedAt?: string }) || null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

export async function setCategories(shopSlug: string, items: any[]): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('categories', 'readwrite');
        tx.objectStore('categories').put({ items, cachedAt: new Date().toISOString() }, shopSlug);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function getCategories(shopSlug: string): Promise<{ items: any[]; cachedAt?: string } | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('categories', 'readonly');
        const req = tx.objectStore('categories').get(shopSlug);
        req.onsuccess = () => { db.close(); resolve((req.result as { items: any[]; cachedAt?: string }) || null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

export async function setBrands(shopSlug: string, items: any[]): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('brands', 'readwrite');
        tx.objectStore('brands').put({ items, cachedAt: new Date().toISOString() }, shopSlug);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function getBrands(shopSlug: string): Promise<{ items: any[]; cachedAt?: string } | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('brands', 'readonly');
        const req = tx.objectStore('brands').get(shopSlug);
        req.onsuccess = () => { db.close(); resolve((req.result as { items: any[]; cachedAt?: string }) || null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

/** Get a single product by id from cached products for a shop. */
export async function getProductById(shopSlug: string, productId: string): Promise<any | null> {
    const cached = await getProducts(shopSlug);
    if (!cached?.items?.length) return null;
    return cached.items.find((p: any) => p.id === productId || String(p.id) === String(productId)) || null;
}
