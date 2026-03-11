/**
 * Subscribes to the browser online event and runs all offline sync queues,
 * then refreshes caches so local DB stays in sync with cloud.
 */

import { useEffect } from 'react';
import { subscribeToOnline, processPendingProductQueue } from '../services/productSyncService';
import { processPendingAccountingQueue } from '../services/accountingSyncService';
import { processPendingProcurementQueue } from '../services/procurementSyncService';
import { processPendingCategoryQueue } from '../services/categorySyncService';
import { getShopCategoriesOfflineFirst } from '../services/categoriesOfflineCache';
import { refreshDashboardCache } from '../services/dashboardOfflineCache';
import { getTenantId } from '../services/posOfflineDb';
import { shopApi } from '../services/shopApi';
import { setBranchesCache, setTerminalsCache } from '../services/branchesTerminalsCache';

export function SyncOnOnline() {
  useEffect(() => {
    const runSync = async () => {
      await processPendingProductQueue();
      await processPendingCategoryQueue();
      await processPendingAccountingQueue();
      await processPendingProcurementQueue();
      const tenantId = getTenantId();
      if (tenantId) {
        await getShopCategoriesOfflineFirst(); // fetches and caches when online
        await refreshDashboardCache(tenantId);
        const [b, t] = await Promise.all([
          shopApi.getBranches().catch(() => []),
          shopApi.getTerminals().catch(() => []),
        ]);
        await setBranchesCache(tenantId, Array.isArray(b) ? b : []);
        await setTerminalsCache(tenantId, Array.isArray(t) ? t : []);
      }
    };

    const unsubscribe = subscribeToOnline(() => {
      runSync().catch(() => {});
    });

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      runSync().catch(() => {});
    }

    return unsubscribe;
  }, []);
  return null;
}
