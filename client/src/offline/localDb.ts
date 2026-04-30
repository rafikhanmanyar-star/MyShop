/**
 * Offline-first local mirror + unified sync queue (IndexedDB).
 * Uses the same database as posOfflineDb (myshop_pos_offline v3+).
 */

import { openPosOfflineDb } from '../services/posOfflineDb';

export type ConflictPolicy = 'latest_wins' | 'server_wins';

export type SyncQueueEntity =
  | 'sale'
  | 'expense'
  | 'product_create'
  | 'customer'
  | 'accounting'
  | 'procurement'
  | 'category';

export type SyncQueueOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export interface SyncQueueItem {
  localId: string;
  entityType: SyncQueueEntity;
  operation: SyncQueueOperation;
  payloadJson: string;
  createdAt: string;
  retryCount: number;
  syncStatus: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  lastError?: string;
  dependsOnLocalId?: string;
  serverId?: string;
}

export interface SyncConflictEntry {
  id: string;
  entityType: string;
  entityKey: string;
  message: string;
  localUpdatedAt?: string;
  serverUpdatedAt?: string;
  createdAt: string;
  resolved?: boolean;
}

export interface SyncBootstrapPayload {
  serverTime: string;
  warehouses: unknown[];
  branches: unknown[];
  terminals: unknown[];
  categories: unknown[];
  brands: unknown[];
  contacts: unknown[];
  shop_policies: unknown | null;
  pos_settings: unknown;
  receipt_settings: unknown;
  loyalty_members: unknown[];
  skus: { items?: unknown[] };
}

export interface SyncChangesPayload {
  serverTime: string;
  sinceEffective: string;
  products?: unknown[];
  inventory?: unknown[];
  categories?: unknown[];
  brands?: unknown[];
  contacts?: unknown[];
  warehouses?: unknown[];
  branches?: unknown[];
  terminals?: unknown[];
  shop_policies?: unknown[];
  pos_settings?: unknown[];
  skus_delta?: { items?: unknown[] };
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openPosOfflineDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getSyncMeta(key: string): Promise<string | null> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_meta', 'readonly');
        const r = t.objectStore('sync_meta').get(key);
        r.onsuccess = () => {
          const row = r.result as { key: string; value: string } | undefined;
          resolve(row?.value ?? null);
        };
        r.onerror = () => reject(r.error);
      })
  );
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_meta', 'readwrite');
        t.objectStore('sync_meta').put({ key, value });
        txDone(t).then(resolve).catch(reject);
      })
  );
}

export async function getConflictPolicy(): Promise<ConflictPolicy> {
  const v = await getSyncMeta('conflict_policy');
  return v === 'server_wins' ? 'server_wins' : 'latest_wins';
}

export async function setConflictPolicy(policy: ConflictPolicy): Promise<void> {
  await setSyncMeta('conflict_policy', policy);
}

async function bulkPutInStore(db: IDBDatabase, storeName: string, rows: Array<{ id: string } & Record<string, unknown>>) {
  if (rows.length === 0) return;
  const t = db.transaction(storeName, 'readwrite');
  const s = t.objectStore(storeName);
  for (const row of rows) {
    if (row?.id) s.put(row);
  }
  await txDone(t);
}

async function putSingleton(db: IDBDatabase, key: string, payload: unknown) {
  const t = db.transaction('sync_singletons', 'readwrite');
  t.objectStore('sync_singletons').put({ key, payload });
  await txDone(t);
}

function mapRows(raw: unknown): Array<{ id: string } & Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is Record<string, unknown> & { id: string } => r != null && typeof r === 'object' && typeof (r as any).id === 'string');
}

export async function applyBootstrapPayload(payload: SyncBootstrapPayload): Promise<void> {
  const db = await openPosOfflineDb();
  try {
    await bulkPutInStore(db, 'sync_warehouses', mapRows(payload.warehouses));
    await bulkPutInStore(db, 'sync_branches', mapRows(payload.branches));
    await bulkPutInStore(db, 'sync_terminals', mapRows(payload.terminals));
    await bulkPutInStore(db, 'sync_categories', mapRows(payload.categories));
    await bulkPutInStore(db, 'sync_brands', mapRows(payload.brands));
    await bulkPutInStore(db, 'sync_contacts', mapRows(payload.contacts));
    await bulkPutInStore(db, 'sync_loyalty_members', mapRows(payload.loyalty_members));

    const skuItems = (payload.skus?.items ?? []) as Array<{ id: string } & Record<string, unknown>>;
    await bulkPutInStore(db, 'sync_skus', skuItems.filter((x) => x?.id));

    if (payload.shop_policies != null) {
      await putSingleton(db, 'shop_policies', payload.shop_policies);
    }
    if (payload.pos_settings != null) {
      await putSingleton(db, 'pos_settings', payload.pos_settings);
    }
    if (payload.receipt_settings != null) {
      await putSingleton(db, 'receipt_settings', payload.receipt_settings);
    }

    const metaT = db.transaction('sync_meta', 'readwrite');
    const m = metaT.objectStore('sync_meta');
    m.put({ key: 'last_full_sync_at', value: payload.serverTime });
    m.put({ key: 'last_delta_sync_at', value: payload.serverTime });
    await txDone(metaT);
  } finally {
    db.close();
  }
}

/** Merge delta SKU rows into sync_skus (full row per product id). */
export async function applySyncChangesPayload(ch: SyncChangesPayload): Promise<void> {
  const db = await openPosOfflineDb();
  try {
    await bulkPutInStore(db, 'sync_categories', mapRows(ch.categories));
    await bulkPutInStore(db, 'sync_brands', mapRows(ch.brands));
    await bulkPutInStore(db, 'sync_contacts', mapRows(ch.contacts));
    await bulkPutInStore(db, 'sync_warehouses', mapRows(ch.warehouses));
    await bulkPutInStore(db, 'sync_branches', mapRows(ch.branches));
    await bulkPutInStore(db, 'sync_terminals', mapRows(ch.terminals));

    const skuItems = (ch.skus_delta?.items ?? []) as Array<{ id: string } & Record<string, unknown>>;
    if (skuItems.length > 0) {
      await bulkPutInStore(db, 'sync_skus', skuItems.filter((x) => x?.id));
    }

    if (Array.isArray(ch.shop_policies) && ch.shop_policies[0]) {
      await putSingleton(db, 'shop_policies', ch.shop_policies[0]);
    }
    if (Array.isArray(ch.pos_settings) && ch.pos_settings[0]) {
      await putSingleton(db, 'pos_settings', ch.pos_settings[0]);
    }

    const metaT = db.transaction('sync_meta', 'readwrite');
    metaT.objectStore('sync_meta').put({ key: 'last_delta_sync_at', value: ch.serverTime });
    await txDone(metaT);
  } finally {
    db.close();
  }
}

export async function getAllLocalSkus(): Promise<Record<string, unknown>[]> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_skus', 'readonly');
        const r = t.objectStore('sync_skus').getAll();
        r.onsuccess = () => resolve((r.result as Record<string, unknown>[]) || []);
        r.onerror = () => reject(r.error);
      })
  );
}

export async function getMirrorWarehouses(): Promise<Record<string, unknown>[]> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_warehouses', 'readonly');
        const r = t.objectStore('sync_warehouses').getAll();
        r.onsuccess = () => resolve((r.result as Record<string, unknown>[]) || []);
        r.onerror = () => reject(r.error);
      })
  );
}

export async function getMirrorBranches(): Promise<Record<string, unknown>[]> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_branches', 'readonly');
        const r = t.objectStore('sync_branches').getAll();
        r.onsuccess = () => resolve((r.result as Record<string, unknown>[]) || []);
        r.onerror = () => reject(r.error);
      })
  );
}

export async function getMirrorTerminals(): Promise<Record<string, unknown>[]> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_terminals', 'readonly');
        const r = t.objectStore('sync_terminals').getAll();
        r.onsuccess = () => resolve((r.result as Record<string, unknown>[]) || []);
        r.onerror = () => reject(r.error);
      })
  );
}

export async function getMirrorPosSettings(): Promise<unknown | null> {
  return getSingletonPayload('pos_settings');
}

export async function getMirrorReceiptSettings(): Promise<unknown | null> {
  return getSingletonPayload('receipt_settings');
}

export async function getSingletonPayload(key: string): Promise<unknown | null> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_singletons', 'readonly');
        const r = t.objectStore('sync_singletons').get(key);
        r.onsuccess = () => {
          const row = r.result as { key: string; payload: unknown } | undefined;
          resolve(row?.payload ?? null);
        };
        r.onerror = () => reject(r.error);
      })
  );
}

export async function replaceSkuRow(productId: string, row: Record<string, unknown> | null): Promise<void> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_skus', 'readwrite');
        const s = t.objectStore('sync_skus');
        if (row == null) {
          s.delete(productId);
        } else {
          s.put({ ...row, id: productId });
        }
        txDone(t).then(resolve).catch(reject);
      })
  );
}

/** Apply quantity delta to a mirrored SKU row's warehouse_stock / sellable fields (best-effort for offline sales). */
export async function applyLocalStockDeduction(
  productId: string,
  warehouseId: string,
  quantityDelta: number
): Promise<void> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_skus', 'readwrite');
        const s = t.objectStore('sync_skus');
        const req = s.get(productId);
        req.onsuccess = () => {
          const row = req.result as Record<string, unknown> | undefined;
          if (!row) {
            txDone(t).then(resolve).catch(reject);
            return;
          }
          const wsRaw = row.warehouse_stock;
          let ws: Record<string, number> = {};
          if (wsRaw && typeof wsRaw === 'object' && !Array.isArray(wsRaw)) {
            ws = { ...(wsRaw as Record<string, number>) };
          } else if (typeof wsRaw === 'string') {
            try {
              ws = JSON.parse(wsRaw);
            } catch {
              ws = {};
            }
          }
          const prev = Number(ws[warehouseId] ?? 0);
          ws[warehouseId] = Math.max(0, prev + quantityDelta);
          const newRow = {
            ...row,
            warehouse_stock: ws,
            on_hand: Math.max(0, Number(row.on_hand ?? 0) + quantityDelta),
            available: Math.max(0, Number(row.available ?? 0) + quantityDelta),
            sellableOnHand: Math.max(0, Number((row as any).sellable_on_hand ?? row.available ?? 0) + quantityDelta),
          };
          (newRow as any).sellable_on_hand = newRow.sellableOnHand;
          s.put(newRow);
          txDone(t).then(resolve).catch(reject);
        };
        req.onerror = () => reject(req.error);
      })
  );
}

export async function enqueueSyncJob(item: Omit<SyncQueueItem, 'retryCount' | 'syncStatus'> & Partial<Pick<SyncQueueItem, 'retryCount' | 'syncStatus'>>): Promise<void> {
  const full: SyncQueueItem = {
    ...item,
    retryCount: item.retryCount ?? 0,
    syncStatus: item.syncStatus ?? 'PENDING',
  };
  return withDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction('sync_queue', 'readwrite');
        t.objectStore('sync_queue').put(full);
        txDone(t)
          .then(() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('myshop:pending-changed'));
            }
            resolve();
          })
          .catch(reject);
      })
  );
}

export async function updateSyncJob(localId: string, patch: Partial<SyncQueueItem>): Promise<void> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_queue', 'readwrite');
        const s = t.objectStore('sync_queue');
        const r = s.get(localId);
        r.onsuccess = () => {
          const cur = r.result as SyncQueueItem | undefined;
          if (!cur) {
            txDone(t).then(resolve).catch(reject);
            return;
          }
          s.put({ ...cur, ...patch });
          txDone(t).then(resolve).catch(reject);
        };
        r.onerror = () => reject(r.error);
      })
  );
}

export async function getPendingSyncJobs(): Promise<SyncQueueItem[]> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_queue', 'readonly');
        const r = t.objectStore('sync_queue').getAll();
        r.onsuccess = () => {
          const all = (r.result as SyncQueueItem[]) || [];
          resolve(
            all
              .filter((j) => j.syncStatus === 'PENDING' || j.syncStatus === 'FAILED')
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          );
        };
        r.onerror = () => reject(r.error);
      })
  );
}

export async function countPendingSyncJobs(): Promise<number> {
  const j = await getPendingSyncJobs();
  return j.length;
}

export async function removeSyncJob(localId: string): Promise<void> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_queue', 'readwrite');
        t.objectStore('sync_queue').delete(localId);
        txDone(t).then(resolve).catch(reject);
      })
  );
}

export async function logConflict(entry: Omit<SyncConflictEntry, 'id' | 'createdAt'> & { id?: string }): Promise<void> {
  const id = entry.id ?? `cf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row: SyncConflictEntry = {
    id,
    entityType: entry.entityType,
    entityKey: entry.entityKey,
    message: entry.message,
    localUpdatedAt: entry.localUpdatedAt,
    serverUpdatedAt: entry.serverUpdatedAt,
    createdAt: new Date().toISOString(),
    resolved: false,
  };
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_conflicts', 'readwrite');
        t.objectStore('sync_conflicts').put(row);
        txDone(t).then(resolve).catch(reject);
      })
  );
}

export async function getRecentConflicts(limit = 50): Promise<SyncConflictEntry[]> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('sync_conflicts', 'readonly');
        const r = t.objectStore('sync_conflicts').getAll();
        r.onsuccess = () => {
          const rows = ((r.result as SyncConflictEntry[]) || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          resolve(rows.slice(0, limit));
        };
        r.onerror = () => reject(r.error);
      })
  );
}

export function generateLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
