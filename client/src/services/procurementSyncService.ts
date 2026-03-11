/**
 * Offline-first procurement sync: queue create purchase bill and record
 * supplier payment when offline; sync when online.
 */

import { procurementApi } from './shopApi';
import {
  addPendingProcurement,
  getAllPendingProcurement,
  setPendingProcurementStatus,
  removePendingProcurement,
  type PendingProcurementAction,
} from './procurementSyncStore';
import { setProcurementCache, getProcurementCache, getTenantId } from './procurementOfflineCache';

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

async function refreshProcurementCache(): Promise<void> {
  const tenantId = getTenantId();
  if (!tenantId) return;
  try {
    const [bills, payments, apAging, inventoryVal] = await Promise.all([
      procurementApi.getPurchaseBills().catch(() => []),
      procurementApi.getSupplierPayments().catch(() => []),
      procurementApi.reports.apAging().catch(() => null),
      procurementApi.reports.inventoryValuation().catch(() => null),
    ]);
    await setProcurementCache(tenantId, {
      purchaseBills: Array.isArray(bills) ? bills : [],
      supplierPayments: Array.isArray(payments) ? payments : [],
      apAging: apAging ?? null,
      inventoryValuation: inventoryVal ?? null,
    });
  } catch {
    // ignore
  }
}

export async function createPurchaseBillOfflineFirst(payload: any): Promise<{
  synced: boolean;
  result?: any;
  localId?: string;
}> {
  if (isOnline()) {
    try {
      const result = await procurementApi.createPurchaseBill(payload);
      await refreshProcurementCache();
      return { synced: true, result };
    } catch (err: any) {
      if (!isOnline() || isRetryableError(err)) {
        const localId = await addPendingProcurement({ action: 'create_purchase_bill', payload });
        return { synced: false, localId };
      }
      throw err;
    }
  }
  const localId = await addPendingProcurement({ action: 'create_purchase_bill', payload });
  return { synced: false, localId };
}

export async function recordSupplierPaymentOfflineFirst(payload: any): Promise<{
  synced: boolean;
  result?: any;
  localId?: string;
}> {
  if (isOnline()) {
    try {
      const result = await procurementApi.recordSupplierPayment(payload);
      await refreshProcurementCache();
      return { synced: true, result };
    } catch (err: any) {
      if (!isOnline() || isRetryableError(err)) {
        const localId = await addPendingProcurement({ action: 'record_supplier_payment', payload });
        return { synced: false, localId };
      }
      throw err;
    }
  }
  const localId = await addPendingProcurement({ action: 'record_supplier_payment', payload });
  return { synced: false, localId };
}

export async function processPendingProcurementQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const pending = await getAllPendingProcurement();
  let succeeded = 0;
  let failed = 0;
  for (const item of pending) {
    if (!isOnline()) break;
    await setPendingProcurementStatus(item.localId, 'syncing');
    try {
      switch (item.action as PendingProcurementAction) {
        case 'create_purchase_bill':
          await procurementApi.createPurchaseBill(item.payload);
          break;
        case 'record_supplier_payment':
          await procurementApi.recordSupplierPayment(item.payload);
          break;
        default:
          throw new Error(`Unknown action: ${(item as any).action}`);
      }
      await setPendingProcurementStatus(item.localId, 'synced');
      await removePendingProcurement(item.localId);
      succeeded++;
    } catch (err: any) {
      await setPendingProcurementStatus(item.localId, 'failed', err?.message ?? 'Sync failed');
      failed++;
    }
  }
  if (succeeded > 0) await refreshProcurementCache();
  return { processed: pending.length, succeeded, failed };
}

export { getProcurementCache, setProcurementCache } from './procurementOfflineCache';
