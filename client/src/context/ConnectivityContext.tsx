import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useOnline } from '../hooks/useOnline';
import { getSyncMeta, countPendingSyncJobs } from '../offline/localDb';
import { isBrowserOnline } from '../offline/syncEngine';
import { runOnlineSyncPipeline } from '../offline/runOnlineSyncPipeline';

export type ConnectivityUiStatus = 'online' | 'offline' | 'syncing';

type ConnectivityContextValue = {
  status: ConnectivityUiStatus;
  pendingSyncCount: number;
  lastSyncAt: string | null;
  /** Kick background sync (pull + push); sets status to syncing briefly. */
  refreshSyncState: () => Promise<void>;
};

const ConnectivityContext = createContext<ConnectivityContextValue | undefined>(undefined);

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useOnline();
  const [status, setStatus] = useState<ConnectivityUiStatus>(isOnline ? 'online' : 'offline');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const refreshSyncState = useCallback(async () => {
    const pending = await countPendingSyncJobs().catch(() => 0);
    setPendingSyncCount(pending);
    const last = await getSyncMeta('last_delta_sync_at').catch(() => null);
    setLastSyncAt(last);
  }, []);

  useEffect(() => {
    refreshSyncState().catch(() => {});
  }, [refreshSyncState]);

  useEffect(() => {
    const onPending = () => {
      refreshSyncState().catch(() => {});
    };
    window.addEventListener('myshop:pending-changed', onPending);
    window.addEventListener('myshop:sync:catalog-done', onPending);
    return () => {
      window.removeEventListener('myshop:pending-changed', onPending);
      window.removeEventListener('myshop:sync:catalog-done', onPending);
    };
  }, [refreshSyncState]);

  useEffect(() => {
    if (!isOnline) {
      setStatus('offline');
      return;
    }
    setStatus('online');
  }, [isOnline]);

  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      void runOnlineSyncPipeline({ refreshCaches: false });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    const onStart = () => {
      setStatus((s) => (s === 'offline' ? 'offline' : 'syncing'));
    };
    const onDone = () => {
      setStatus(isBrowserOnline() ? 'online' : 'offline');
      refreshSyncState().catch(() => {});
    };
    window.addEventListener('myshop:sync:start', onStart as EventListener);
    window.addEventListener('myshop:sync:done', onDone as EventListener);
    return () => {
      window.removeEventListener('myshop:sync:start', onStart as EventListener);
      window.removeEventListener('myshop:sync:done', onDone as EventListener);
    };
  }, [refreshSyncState, isOnline]);

  const value = useMemo<ConnectivityContextValue>(
    () => ({
      status,
      pendingSyncCount,
      lastSyncAt,
      refreshSyncState,
    }),
    [status, pendingSyncCount, lastSyncAt, refreshSyncState]
  );

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity() {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) throw new Error('useConnectivity must be used within ConnectivityProvider');
  return ctx;
}
