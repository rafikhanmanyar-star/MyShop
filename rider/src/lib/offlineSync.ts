import { riderApi } from '../api';
import { useOfflineStore, type OfflineAction } from '../stores/offlineStore';

async function runAction(a: OfflineAction): Promise<void> {
  const oid = a.orderId;
  if (!oid && a.type !== 'location') return;
  switch (a.type) {
    case 'accept':
      await riderApi.accept(oid!);
      break;
    case 'picked':
      await riderApi.picked(oid!);
      break;
    case 'onTheWay':
      await riderApi.onTheWay(oid!);
      break;
    case 'arrived':
      await riderApi.arrived(oid!);
      break;
    case 'delivered':
      await riderApi.delivered(oid!, a.body as Parameters<typeof riderApi.delivered>[1]);
      break;
    case 'failed':
      await riderApi.failed(oid!, a.body as Parameters<typeof riderApi.failed>[1]);
      break;
    case 'location': {
      const b = a.body as { latitude?: number; longitude?: number };
      if (b?.latitude != null && b?.longitude != null) {
        await riderApi.postLocation({ latitude: b.latitude, longitude: b.longitude });
      }
      break;
    }
  }
}

let flushing = false;

export async function flushOfflineQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  const { queue, dequeue } = useOfflineStore.getState();
  let done = 0;
  for (const a of [...queue]) {
    try {
      await runAction(a);
      dequeue(a.id);
      done += 1;
    } catch {
      break;
    }
  }
  flushing = false;
  return done;
}

export function startOfflineSyncListener() {
  const onOnline = () => void flushOfflineQueue();
  window.addEventListener('online', onOnline);
  const iv = window.setInterval(() => void flushOfflineQueue(), 45_000);
  return () => {
    window.removeEventListener('online', onOnline);
    window.clearInterval(iv);
  };
}
