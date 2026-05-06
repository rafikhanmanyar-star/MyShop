/**
 * Single entry for “connection is usable” sync: outbox, domain queues, then cache refresh.
 * Serialized with an in-flight guard so intervals, focus, and online events do not overlap.
 */

import { processPendingProductQueue, subscribeToOnline } from '../services/productSyncService';
import { processPendingAccountingQueue } from '../services/accountingSyncService';
import { processPendingProcurementQueue } from '../services/procurementSyncService';
import { processPendingCategoryQueue } from '../services/categorySyncService';
import { processQueue as processExpenseQueue } from '../services/expenseSyncService';
import { getShopCategoriesOfflineFirst } from '../services/categoriesOfflineCache';
import { refreshDashboardCache } from '../services/dashboardOfflineCache';
import { getTenantId } from '../services/posOfflineDb';
import { shopApi } from '../services/shopApi';
import { setBranchesCache, setTerminalsCache } from '../services/branchesTerminalsCache';
import { runBackgroundSync } from './syncEngine';
import { countPendingSyncJobs } from './localDb';

let pipelineInFlight: Promise<void> | null = null;

async function refreshTenantCaches(): Promise<void> {
  const tenantId = getTenantId();
  if (!tenantId) return;
  await getShopCategoriesOfflineFirst();
  await refreshDashboardCache(tenantId);
  const [b, t] = await Promise.all([shopApi.getBranches().catch(() => []), shopApi.getTerminals().catch(() => [])]);
  await setBranchesCache(tenantId, Array.isArray(b) ? b : []);
  await setTerminalsCache(tenantId, Array.isArray(t) ? t : []);
}

/**
 * Runs push/outbox, parallel domain queues, then shared caches. Safe to call repeatedly.
 */
export async function runOnlineSyncPipeline(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (pipelineInFlight) return pipelineInFlight;

  pipelineInFlight = (async () => {
    await runBackgroundSync();
    await Promise.all([
      processPendingProductQueue(),
      processPendingCategoryQueue(),
      processPendingAccountingQueue(),
      processPendingProcurementQueue(),
      processExpenseQueue(),
    ]);
    await refreshTenantCaches();
  })().finally(() => {
    pipelineInFlight = null;
  });

  return pipelineInFlight;
}

/** Subscribe to the browser `online` event only (for use in React mount). */
export function subscribeToBrowserOnline(callback: () => void): () => void {
  return subscribeToOnline(callback);
}

/**
 * When the unified outbox still has work, retry periodically — recovery does not depend
 * on another `online` event if `navigator.onLine` was true during an API outage.
 */
export async function hasUnifiedOutboxWork(): Promise<boolean> {
  const n = await countPendingSyncJobs().catch(() => 0);
  return n > 0;
}
