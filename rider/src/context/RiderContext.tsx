import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type RiderState = {
  shopSlug: string;
  token: string | null;
  riderName: string | null;
  riderId: string | null;
};

type Ctx = RiderState & {
  setSession: (s: Partial<RiderState>) => void;
  logout: () => void;
};

const RiderContext = createContext<Ctx | null>(null);

const STORAGE = 'rider_session_v1';

function loadSession(): RiderState {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { shopSlug: '', token: null, riderName: null, riderId: null };
    const s = JSON.parse(raw) as RiderState;
    if (s.token) localStorage.setItem('rider_token', s.token);
    return s;
  } catch {
    return { shopSlug: '', token: null, riderName: null, riderId: null };
  }
}

export function RiderProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RiderState>(() => loadSession());

  const setSession = useCallback((s: Partial<RiderState>) => {
    setState((prev) => {
      const next = { ...prev, ...s };
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
        if (next.token) localStorage.setItem('rider_token', next.token);
        else localStorage.removeItem('rider_token');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    setState({ shopSlug: state.shopSlug, token: null, riderName: null, riderId: null });
    localStorage.removeItem(STORAGE);
    localStorage.removeItem('rider_token');
  }, [state.shopSlug]);

  const value = useMemo(
    () => ({
      ...state,
      setSession,
      logout,
    }),
    [state, setSession, logout]
  );

  return <RiderContext.Provider value={value}>{children}</RiderContext.Provider>;
}

export function useRider() {
  const c = useContext(RiderContext);
  if (!c) throw new Error('useRider outside RiderProvider');
  return c;
}
