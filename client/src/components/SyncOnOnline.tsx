/**
 * Subscribes to the browser online event and runs all offline sync queues,
 * then refreshes caches so local DB stays in sync with cloud.
 * Also retries on focus / visibility and on an interval when the outbox still has work,
 * so recovery does not depend solely on another `online` event.
 */

import { useEffect } from 'react';
import {
  runOnlineSyncPipeline,
  subscribeToBrowserOnline,
  hasUnifiedOutboxWork,
} from '../offline/runOnlineSyncPipeline';

const OUTBOX_RETRY_MS = 40_000;
const VISIBILITY_DEBOUNCE_MS = 350;

export function SyncOnOnline() {
  useEffect(() => {
    let intervalId: number | undefined;
    let visTimer: number | undefined;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (visTimer) clearTimeout(visTimer);
      visTimer = window.setTimeout(() => {
        visTimer = undefined;
        void runOnlineSyncPipeline();
      }, VISIBILITY_DEBOUNCE_MS);
    };

    const onFocus = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      onVisible();
    };

    const unsubscribe = subscribeToBrowserOnline(() => {
      void runOnlineSyncPipeline();
    });

    intervalId = window.setInterval(() => {
      if (typeof navigator === 'undefined' || !navigator.onLine) return;
      void (async () => {
        if (await hasUnifiedOutboxWork()) await runOnlineSyncPipeline();
      })();
    }, OUTBOX_RETRY_MS);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void runOnlineSyncPipeline();
    }

    return () => {
      unsubscribe();
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (visTimer !== undefined) window.clearTimeout(visTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
