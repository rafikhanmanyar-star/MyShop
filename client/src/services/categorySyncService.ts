/**
 * Offline-first category sync: queue create category when offline, sync when online.
 */

import { shopApi } from './shopApi';
import { setCategories, getCachedCategories } from './categoriesOfflineCache';
import { getTenantId } from './posOfflineDb';
import {
  addPendingCategory,
  getAllPendingCategories,
  setPendingCategoryStatus,
  removePendingCategory,
} from './categorySyncStore';

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

function isRetryableError(err: any): boolean {
  if (!err) return false;
  const status = err?.status;
  if (status === 0 || status === 502 || status === 503 || status === 504) return true;
  const msg = String(err?.error ?? err?.message ?? '').toLowerCase();
  return /unavailable|bad gateway|network|timed out|failed to fetch/i.test(msg);
}

export async function createCategoryOfflineFirst(
  name: string,
  parentId?: string | null
): Promise<{
  synced: boolean;
  id?: string;
  localId?: string;
}> {
  const tenantId = getTenantId();
  const payload = { name, ...(parentId ? { parentId } : {}) };
  if (isOnline()) {
    try {
      const result = await shopApi.createShopCategory(payload);
      const list = await shopApi.getShopCategories();
      if (tenantId) await setCategories(tenantId, Array.isArray(list) ? list : []);
      return { synced: true, id: result?.id };
    } catch (err: any) {
      if (!isOnline() || isRetryableError(err)) {
        const localId = await addPendingCategory(name, parentId);
        if (tenantId) {
          const cached = await getCachedCategories(tenantId);
          const items = cached?.items ?? [];
          await setCategories(tenantId, [
            ...items,
            {
              id: localId,
              name,
              type: 'product',
              parent_id: parentId ?? null,
              created_at: new Date().toISOString(),
            },
          ]);
        }
        return { synced: false, localId };
      }
      throw err;
    }
  }
  const localId = await addPendingCategory(name, parentId);
  if (tenantId) {
    const cached = await getCachedCategories(tenantId);
    const items = cached?.items ?? [];
    await setCategories(tenantId, [
      ...items,
      {
        id: localId,
        name,
        type: 'product',
        parent_id: parentId ?? null,
        created_at: new Date().toISOString(),
      },
    ]);
  }
  return { synced: false, localId };
}

export async function processPendingCategoryQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const pending = await getAllPendingCategories();
  const tenantId = getTenantId();
  let succeeded = 0;
  let failed = 0;
  for (const item of pending) {
    if (!isOnline()) break;
    await setPendingCategoryStatus(item.localId, 'syncing');
    try {
      const result = await shopApi.createShopCategory({
        name: item.name,
        ...(item.parentId ? { parentId: item.parentId } : {}),
      });
      await setPendingCategoryStatus(item.localId, 'synced', result?.id);
      await removePendingCategory(item.localId);
      succeeded++;
    } catch (err: any) {
      await setPendingCategoryStatus(item.localId, 'failed', undefined, err?.message ?? 'Sync failed');
      failed++;
    }
  }
  if (succeeded > 0 && tenantId) {
    const list = await shopApi.getShopCategories();
    await setCategories(tenantId, Array.isArray(list) ? list : []);
  }
  return { processed: pending.length, succeeded, failed };
}
