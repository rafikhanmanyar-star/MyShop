import React from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useConnectivity } from '../context/ConnectivityContext';

function formatSyncTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export default function OfflineBanner() {
  const { status, pendingSyncCount, lastSyncAt } = useConnectivity();

  if (status === 'online' && pendingSyncCount === 0) {
    return null;
  }

  const syncHint =
    pendingSyncCount > 0
      ? `${pendingSyncCount} item${pendingSyncCount === 1 ? '' : 's'} waiting for sync`
      : '';
  const timeHint = lastSyncAt ? `Last sync: ${formatSyncTime(lastSyncAt)}` : '';

  if (status === 'offline') {
    return (
      <div className="px-4 py-2 bg-amber-500 text-amber-950 text-sm font-medium flex items-center justify-center gap-2 flex-wrap">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>Offline — local data and queued actions will sync when connection is restored.</span>
        {(syncHint || timeHint) && (
          <span className="text-amber-900/90 text-xs font-normal">
            {[syncHint, timeHint].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    );
  }

  if (status === 'syncing') {
    return (
      <div className="px-4 py-2 bg-sky-600 text-white text-sm font-medium flex items-center justify-center gap-2 flex-wrap">
        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
        <span>Syncing…</span>
        {syncHint && <span className="text-sky-100 text-xs font-normal">{syncHint}</span>}
      </div>
    );
  }

  return (
    <div className="px-4 py-1.5 bg-emerald-700/90 text-white text-xs font-medium flex items-center justify-center gap-2 flex-wrap">
      <Wifi className="w-3.5 h-3.5 shrink-0" />
      <span>{syncHint}</span>
      {timeHint && <span className="text-emerald-100/90">{timeHint}</span>}
    </div>
  );
}
