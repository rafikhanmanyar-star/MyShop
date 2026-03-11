/**
 * Offline-first accounting sync: queue mutations when offline, sync when online.
 */

import { accountingApi } from './shopApi';
import {
  addPendingAccounting,
  getAllPendingAccounting,
  setPendingAccountingStatus,
  removePendingAccounting,
  type PendingAccountingItem,
  type PendingAccountingAction,
} from './accountingSyncStore';
import { setAccountingCache, getAccountingCache, type AccountingCacheData } from './accountingOfflineCache';
import { getTenantId } from './posOfflineDb';

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

async function refreshAndCache(): Promise<void> {
  const tenantId = getTenantId();
  if (!tenantId) return;
  try {
    const [accounts, journalEntries, summary, bankBalances, salesBySource] = await Promise.all([
      accountingApi.getAccounts().catch(() => []),
      accountingApi.getJournalEntries().catch(() => []),
      accountingApi.getFinancialSummary().catch(() => ({})),
      accountingApi.getBankBalances().catch(() => []),
      accountingApi.getSalesBySource().catch(() => null),
    ]);
    const data: AccountingCacheData = {
      accounts: accounts || [],
      journalEntries: journalEntries || [],
      summary: summary || {},
      bankBalances: bankBalances || [],
      salesBySource: salesBySource ?? null,
    };
    await setAccountingCache(tenantId, data);
  } catch {
    // ignore
  }
}

export async function createAccountOfflineFirst(data: any): Promise<{ synced: boolean; result?: any; localId?: string }> {
  if (isOnline()) {
    try {
      const result = await accountingApi.createAccount(data);
      await refreshAndCache();
      return { synced: true, result };
    } catch (err: any) {
      if (!isOnline() || isRetryableError(err)) {
        const localId = await addPendingAccounting({ action: 'create_account', payload: data });
        return { synced: false, localId };
      }
      throw err;
    }
  }
  const localId = await addPendingAccounting({ action: 'create_account', payload: data });
  return { synced: false, localId };
}

export async function updateAccountOfflineFirst(id: string, data: any): Promise<{ synced: boolean; result?: any; localId?: string }> {
  if (isOnline()) {
    try {
      const result = await accountingApi.updateAccount(id, data);
      await refreshAndCache();
      return { synced: true, result };
    } catch (err: any) {
      if (!isOnline() || isRetryableError(err)) {
        const localId = await addPendingAccounting({ action: 'update_account', payload: { id, data } });
        return { synced: false, localId };
      }
      throw err;
    }
  }
  const localId = await addPendingAccounting({ action: 'update_account', payload: { id, data } });
  return { synced: false, localId };
}

export async function deleteAccountOfflineFirst(id: string): Promise<{ synced: boolean; localId?: string }> {
  if (isOnline()) {
    try {
      await accountingApi.deleteAccount(id);
      await refreshAndCache();
      return { synced: true };
    } catch (err: any) {
      if (!isOnline() || isRetryableError(err)) {
        const localId = await addPendingAccounting({ action: 'delete_account', payload: { id } });
        return { synced: false, localId };
      }
      throw err;
    }
  }
  const localId = await addPendingAccounting({ action: 'delete_account', payload: { id } });
  return { synced: false, localId };
}

export async function postJournalEntryOfflineFirst(data: any): Promise<{ synced: boolean; result?: any; localId?: string }> {
  if (isOnline()) {
    try {
      const result = await accountingApi.postJournalEntry(data);
      await refreshAndCache();
      return { synced: true, result };
    } catch (err: any) {
      if (!isOnline() || isRetryableError(err)) {
        const localId = await addPendingAccounting({ action: 'post_journal_entry', payload: data });
        return { synced: false, localId };
      }
      throw err;
    }
  }
  const localId = await addPendingAccounting({ action: 'post_journal_entry', payload: data });
  return { synced: false, localId };
}

export async function processPendingAccountingQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const pending = await getAllPendingAccounting();
  let succeeded = 0;
  let failed = 0;
  for (const item of pending) {
    if (!isOnline()) break;
    await setPendingAccountingStatus(item.localId, 'syncing');
    try {
      switch (item.action as PendingAccountingAction) {
        case 'create_account':
          await accountingApi.createAccount(item.payload);
          break;
        case 'update_account':
          await accountingApi.updateAccount(item.payload.id, item.payload.data);
          break;
        case 'delete_account':
          await accountingApi.deleteAccount(item.payload.id);
          break;
        case 'post_journal_entry':
          await accountingApi.postJournalEntry(item.payload);
          break;
        default:
          throw new Error(`Unknown action: ${(item as any).action}`);
      }
      await setPendingAccountingStatus(item.localId, 'synced');
      await removePendingAccounting(item.localId);
      succeeded++;
    } catch (err: any) {
      await setPendingAccountingStatus(item.localId, 'failed', err?.message ?? 'Sync failed');
      failed++;
    }
  }
  if (succeeded > 0) await refreshAndCache();
  return { processed: pending.length, succeeded, failed };
}

export { getAccountingCache, setAccountingCache } from './accountingOfflineCache';
