import { useEffect, useRef, useState, useCallback } from 'react';
import { shopApi } from '../services/shopApi';
import { getApiBaseUrl } from '../config/apiUrl';
import { apiClient } from '../services/apiClient';

const HEARTBEAT_MS = 25_000;
const POLL_BLOCKED_MS = 2_000;

export type SettingsEditLockMode = 'loading' | 'editing' | 'blocked';

/**
 * Cooperative lock for the Settings module: only one browser session should edit at a time.
 * Uses server lease + heartbeat; blocked users poll until the lock is released.
 */
export function useSettingsEditLock(userId: string | undefined, userDisplayName: string) {
  const [mode, setMode] = useState<SettingsEditLockMode>('loading');
  const [blockedByName, setBlockedByName] = useState<string | null>(null);
  const [lostLock, setLostLock] = useState(false);
  const holdRef = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const tryAcquire = useCallback(async () => {
    if (!userId) {
      holdRef.current = false;
      setMode('editing');
      return;
    }
    try {
      await shopApi.acquireSettingsEditLock(userDisplayName);
      holdRef.current = true;
      setLostLock(false);
      setMode('editing');
      setBlockedByName(null);
    } catch (e: any) {
      if (e?.status === 409) {
        const name = e?.lockedBy?.userName || e?.message || 'Another user';
        setBlockedByName(typeof name === 'string' ? name : 'Another user');
        setMode('blocked');
        holdRef.current = false;
      } else {
        console.warn('Settings edit lock acquire failed:', e);
        holdRef.current = false;
        setMode('editing');
      }
    }
  }, [userId, userDisplayName]);

  useEffect(() => {
    void tryAcquire();
  }, [tryAcquire]);

  useEffect(() => {
    if (mode !== 'editing' || !userId) return;
    const id = window.setInterval(() => {
      void shopApi.heartbeatSettingsEditLock().catch((e: any) => {
        if (e?.status === 409) {
          holdRef.current = false;
          setLostLock(true);
          setBlockedByName(
            'Your edit session ended or another user is editing Settings. Stop making changes until the lock is available.'
          );
          setMode('blocked');
        }
      });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [mode, userId]);

  useEffect(() => {
    if (mode !== 'blocked' || !userId) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const status = await shopApi.getSettingsEditLock();
          if (!status.locked) {
            await tryAcquire();
          }
        } catch {
          /* ignore */
        }
      })();
    }, POLL_BLOCKED_MS);
    return () => window.clearInterval(id);
  }, [mode, userId, tryAcquire]);

  useEffect(() => {
    const onLockEvent = () => {
      if (modeRef.current !== 'blocked' || !userId) return;
      void tryAcquire();
    };
    window.addEventListener('shop:settings-lock-changed', onLockEvent);
    return () => window.removeEventListener('shop:settings-lock-changed', onLockEvent);
  }, [userId, tryAcquire]);

  useEffect(() => {
    const onUnload = () => {
      if (!userId || !holdRef.current) return;
      const token = localStorage.getItem('auth_token');
      const tenantId = localStorage.getItem('tenant_id');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenantId ? { 'x-org-id': tenantId } : {}),
      };
      const branchId = apiClient.getBranchId();
      if (branchId) headers['x-branch-id'] = branchId;
      void fetch(`${getApiBaseUrl()}/shop/settings/edit-lock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'release' }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [userId]);

  useEffect(() => {
    return () => {
      if (holdRef.current && userId) {
        holdRef.current = false;
        void shopApi.releaseSettingsEditLock().catch(() => {});
      }
    };
  }, [userId]);

  return {
    mode,
    blockedByName,
    lostLock,
    retryAcquire: tryAcquire,
  };
}
