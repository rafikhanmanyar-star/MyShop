/**
 * Pull bootstrap/delta from server into IndexedDB; push unified sync_queue (sales).
 */

import { shopApi } from '../services/shopApi';
import { apiClient } from '../services/apiClient';
import {
  applyBootstrapPayload,
  applySyncChangesPayload,
  getAllLocalSkus,
  getSyncMeta,
  getPendingSyncJobs,
  updateSyncJob,
  removeSyncJob,
  type SyncBootstrapPayload,
  type SyncChangesPayload,
} from './localDb';
import { fetchAndCacheImage } from '../services/imageCache';
import { getFullImageUrl } from '../config/apiUrl';

export function isBrowserOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

async function getAuthTenantHeadersOk(): Promise<boolean> {
  try {
    const tid = typeof localStorage !== 'undefined' ? localStorage.getItem('tenant_id') : null;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    return Boolean(tid && token);
  } catch {
    return false;
  }
}

/** Prefetch product images after sync (throttled). */
export async function prefetchSkuImagesThrottled(maxImages = 40, delayMs = 40): Promise<void> {
  const skus = await getAllLocalSkus();
  let n = 0;
  for (const row of skus) {
    if (n >= maxImages) break;
    const path = row.image_url as string | undefined;
    if (!path || typeof path !== 'string') continue;
    const full = getFullImageUrl(path);
    if (!full) continue;
    await fetchAndCacheImage(full, path).catch(() => {});
    n++;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
}

export async function runSyncBootstrap(): Promise<boolean> {
  if (!isBrowserOnline() || !(await getAuthTenantHeadersOk())) return false;
  const raw = (await shopApi.getSyncBootstrap()) as SyncBootstrapPayload;
  if (!raw?.serverTime || !raw.skus) return false;
  await applyBootstrapPayload(raw);
  prefetchSkuImagesThrottled().catch(() => {});
  return true;
}

export async function runSyncDelta(): Promise<boolean> {
  if (!isBrowserOnline() || !(await getAuthTenantHeadersOk())) return false;
  const since = (await getSyncMeta('last_delta_sync_at')) || undefined;
  const raw = (await shopApi.getSyncChanges(since ?? undefined)) as SyncChangesPayload;
  if (!raw?.serverTime) return false;
  await applySyncChangesPayload(raw);
  prefetchSkuImagesThrottled(24).catch(() => {});
  return true;
}

/**
 * If local SKU mirror is empty, run bootstrap; otherwise delta.
 * Call after successful login.
 */
export async function runPullRestoreOrDelta(): Promise<'bootstrap' | 'delta' | 'skipped'> {
  if (!isBrowserOnline() || !(await getAuthTenantHeadersOk())) return 'skipped';
  const local = await getAllLocalSkus();
  if (local.length === 0) {
    const ok = await runSyncBootstrap();
    return ok ? 'bootstrap' : 'skipped';
  }
  const ok = await runSyncDelta();
  return ok ? 'delta' : 'skipped';
}

function jobDependsMet(job: { dependsOnLocalId?: string }, completed: Set<string>): boolean {
  if (!job.dependsOnLocalId) return true;
  return completed.has(job.dependsOnLocalId);
}

export async function processUnifiedOutbox(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const pending = await getPendingSyncJobs();
  let succeeded = 0;
  let failed = 0;
  const completed = new Set<string>();

  for (const job of pending) {
    if (!isBrowserOnline()) break;
    if (!jobDependsMet(job, completed)) continue;

    await updateSyncJob(job.localId, { syncStatus: 'SYNCING' });
    try {
      if (job.entityType === 'sale') {
        const body = JSON.parse(job.payloadJson) as Record<string, unknown>;
        const res = (await apiClient.post('/shop/sales', body)) as {
          id?: string;
          barcode_value?: string;
          duplicate?: boolean;
        };
        const id = res?.id;
        if (!id) {
          throw new Error('Sale sync rejected: no id');
        }
        await removeSyncJob(job.localId);
        completed.add(job.localId);
        succeeded++;
        continue;
      }

      await updateSyncJob(job.localId, {
        syncStatus: 'FAILED',
        lastError: `Unknown entity: ${job.entityType}`,
        retryCount: job.retryCount + 1,
      });
      failed++;
    } catch (err: any) {
      const message = err?.error ?? err?.message ?? 'Sync failed';
      await updateSyncJob(job.localId, {
        syncStatus: 'FAILED',
        lastError: String(message),
        retryCount: job.retryCount + 1,
      });
      failed++;
    }
  }

  return { processed: pending.length, succeeded, failed };
}

export async function runFullOfflineSyncRound(): Promise<void> {
  if (!isBrowserOnline()) return;
  await runPullRestoreOrDelta().catch(() => {});
  await processUnifiedOutbox().catch(() => {});
}
