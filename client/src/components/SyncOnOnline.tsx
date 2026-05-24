/**
 * Subscribes to the browser online event and runs offline sync queues.
 * Deferred until catalog is hydrated so delta sync does not fight initial SKU mapping.
 */

import { useEffect } from 'react';
import {
  runOnlineSyncPipeline,
  subscribeToBrowserOnline,
  hasUnifiedOutboxWork,
} from '../offline/runOnlineSyncPipeline';
import { debugTrace } from '../utils/perfTrace';

const OUTBOX_RETRY_MS = 60_000;
const POST_HYDRATE_BUFFER_MS = 3_000;
const CATALOG_HYDRATE_MAX_WAIT_MS = 45_000;

/** Minimum wait before first sync (let shell paint). */
const INITIAL_SYNC_DELAY_MS = (() => {
  if (typeof navigator === 'undefined') return 8_000;
  if (navigator.userAgent.includes('Electron')) return 25_000;
  if (import.meta.env.DEV) return 20_000;
  return 8_000;
})();

function waitForCatalogHydrated(): Promise<'hydrated' | 'timeout'> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reason: 'hydrated' | 'timeout') => {
      if (settled) return;
      settled = true;
      window.removeEventListener('myshop:catalog:hydrated', onHydrated);
      clearTimeout(fallback);
      resolve(reason);
    };
    const onHydrated = () => finish('hydrated');
    window.addEventListener('myshop:catalog:hydrated', onHydrated);
    const fallback = window.setTimeout(() => finish('timeout'), CATALOG_HYDRATE_MAX_WAIT_MS);
  });
}

export function SyncOnOnline() {
  useEffect(() => {
    let intervalId: number | undefined;
    let cancelled = false;

    const unsubscribe = subscribeToBrowserOnline(() => {
      debugTrace('sync:browser-online');
      void runOnlineSyncPipeline({ refreshCaches: true });
    });

    intervalId = window.setInterval(() => {
      if (typeof navigator === 'undefined' || !navigator.onLine) return;
      void (async () => {
        if (await hasUnifiedOutboxWork()) {
          debugTrace('sync:outbox-retry');
          await runOnlineSyncPipeline({ refreshCaches: false });
        }
      })();
    }, OUTBOX_RETRY_MS);

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void (async () => {
        debugTrace('sync:initial-scheduled', { minDelayMs: INITIAL_SYNC_DELAY_MS });
        await Promise.all([
          waitForCatalogHydrated().then((reason) => {
            debugTrace('sync:catalog-wait-done', { reason });
          }),
          new Promise((r) => window.setTimeout(r, INITIAL_SYNC_DELAY_MS)),
        ]);
        if (cancelled) return;
        await new Promise((r) => window.setTimeout(r, POST_HYDRATE_BUFFER_MS));
        if (cancelled) return;
        debugTrace('sync:initial-pipeline-start');
        await runOnlineSyncPipeline({ refreshCaches: false });
      })();
    }

    return () => {
      cancelled = true;
      unsubscribe();
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);
  return null;
}
