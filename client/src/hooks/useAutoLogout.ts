import { useEffect, useRef, useCallback } from 'react';
import { shopApi } from '../services/shopApi';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click',
];

const POLL_INTERVAL_MS = 60_000;

/**
 * Automatically calls `onLogout` after `auto_logout_minutes` of inactivity.
 * The timeout value is fetched from the server POS settings on mount and
 * re-polled every minute so it stays in sync if changed from another tab.
 *
 * When `auto_logout_minutes` is 0 (or missing), auto-logout is disabled.
 */
export function useAutoLogout(
  isAuthenticated: boolean,
  onLogout: () => void,
) {
  const timeoutMinutesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const minutes = timeoutMinutesRef.current;
    if (minutes <= 0) return;

    timerRef.current = setTimeout(() => {
      onLogoutRef.current();
    }, minutes * 60_000);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      timeoutMinutesRef.current = 0;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const data = await shopApi.getPosSettings();
        if (cancelled) return;
        const mins = data?.auto_logout_minutes ?? 0;
        const changed = mins !== timeoutMinutesRef.current;
        timeoutMinutesRef.current = mins;
        if (changed) resetTimer();
      } catch {
        // keep previous value
      }
    };

    fetchSettings();
    const poll = setInterval(fetchSettings, POLL_INTERVAL_MS);

    const handleActivity = () => resetTimer();

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleActivity, { passive: true });
    }

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleActivity);
      }
    };
  }, [isAuthenticated, resetTimer]);
}
