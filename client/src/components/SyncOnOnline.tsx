/**
 * Subscribes to the browser online event and runs offline sync queues.
 * Deferred and throttled so Electron/desktop UI stays responsive on login and focus.
 */

import { useEffect } from 'react';
import {
  runOnlineSyncPipeline,
  subscribeToBrowserOnline,
  hasUnifiedOutboxWork,
} from '../offline/runOnlineSyncPipeline';

const OUTBOX_RETRY_MS = 60_000;
/** Wait for shell to paint before heavy IndexedDB sync; longer on Electron desktop. */
const INITIAL_SYNC_DELAY_MS =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron') ? 25_000 : 8_000;

export function SyncOnOnline() {
  useEffect(() => {
    let intervalId: number | undefined;
    let initialTimer: number | undefined;

    const unsubscribe = subscribeToBrowserOnline(() => {
      void runOnlineSyncPipeline({ refreshCaches: true });
    });

    intervalId = window.setInterval(() => {
      if (typeof navigator === 'undefined' || !navigator.onLine) return;
      void (async () => {
        if (await hasUnifiedOutboxWork()) {
          await runOnlineSyncPipeline({ refreshCaches: false });
        }
      })();
    }, OUTBOX_RETRY_MS);

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      initialTimer = window.setTimeout(() => {
        void runOnlineSyncPipeline({ refreshCaches: false });
      }, INITIAL_SYNC_DELAY_MS);
    }

    return () => {
      unsubscribe();
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (initialTimer !== undefined) window.clearTimeout(initialTimer);
    };
  }, []);
  return null;
}
