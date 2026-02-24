/**
 * Offline-first expense sync: store locally when offline, POST to API when online.
 * Processes the pending queue on app load and when the browser comes back online.
 */

import { apiClient } from './apiClient';
import {
  addPending,
  getAllPending,
  setStatus,
  removePending,
  type PendingExpenseItem,
} from './expenseSyncStore';

const EXPENSES_ENDPOINT = '/shop/expenses';

export type CreateExpensePayload = PendingExpenseItem['payload'];

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

/** Try to create expense via API; if offline or network error, save to local queue. */
export async function createExpenseOfflineFirst(payload: CreateExpensePayload): Promise<{
  synced: boolean;
  localId?: string;
  serverId?: string;
  error?: string;
}> {
  if (isOnline()) {
    try {
      const result = await apiClient.post<{ id: string; journalEntryId: string }>(
        EXPENSES_ENDPOINT,
        payload
      );
      const serverId = result?.id ?? (result as any)?.data?.id;
      return { synced: true, serverId };
    } catch (err: any) {
      const isNetworkError =
        err?.status === 0 ||
        err?.error === 'NetworkError' ||
        (err?.message && (err.message.includes('fetch') || err.message.includes('network')));
      if (!isOnline() || isNetworkError) {
        const localId = await addPending(payload);
        return { synced: false, localId };
      }
      return {
        synced: false,
        error: err?.error ?? err?.message ?? 'Request failed',
      };
    }
  }
  const localId = await addPending(payload);
  return { synced: false, localId };
}

/** Process all pending expenses: POST each to the API and remove on success. */
export async function processQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const pending = await getAllPending();
  let succeeded = 0;
  let failed = 0;
  for (const item of pending) {
    if (!isOnline()) break;
    await setStatus(item.localId, 'syncing');
    try {
      const result = await apiClient.post<{ id: string }>(EXPENSES_ENDPOINT, item.payload);
      const serverId = result?.id ?? (result as any)?.data?.id;
      await setStatus(item.localId, 'synced', serverId);
      await removePending(item.localId);
      succeeded++;
    } catch (err: any) {
      const message = err?.error ?? err?.message ?? 'Sync failed';
      await setStatus(item.localId, 'failed', undefined, message);
      failed++;
    }
  }
  return {
    processed: pending.length,
    succeeded,
    failed,
  };
}

/** Subscribe to online event and process queue when back online. Returns unsubscribe. */
export function subscribeToOnline(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}

export { getAllPending, getPendingCount } from './expenseSyncStore';
export type { PendingExpenseItem } from './expenseSyncStore';
