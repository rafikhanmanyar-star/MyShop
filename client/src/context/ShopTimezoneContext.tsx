import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { shopApi } from '../services/shopApi';
import {
  DEFAULT_SHOP_TIMEZONE,
  normalizeShopTimezone,
  todayYmdInTimezone,
  lastYmdDaysInTimezone,
} from '../utils/shopTimezone';

interface ShopTimezoneContextValue {
  timezone: string;
  loading: boolean;
  todayYmd: () => string;
  lastYmdDays: (count: number) => string[];
  refresh: () => Promise<void>;
}

const ShopTimezoneContext = createContext<ShopTimezoneContextValue | undefined>(undefined);

export function ShopTimezoneProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [timezone, setTimezone] = useState(DEFAULT_SHOP_TIMEZONE);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setTimezone(DEFAULT_SHOP_TIMEZONE);
      setLoading(false);
      return;
    }
    try {
      const org = await shopApi.getOrganization();
      setTimezone(normalizeShopTimezone(org.timezone));
    } catch {
      setTimezone(DEFAULT_SHOP_TIMEZONE);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const value = useMemo<ShopTimezoneContextValue>(
    () => ({
      timezone,
      loading,
      todayYmd: () => todayYmdInTimezone(timezone),
      lastYmdDays: (count: number) => lastYmdDaysInTimezone(count, timezone),
      refresh,
    }),
    [timezone, loading, refresh]
  );

  return (
    <ShopTimezoneContext.Provider value={value}>{children}</ShopTimezoneContext.Provider>
  );
}

export function useShopTimezone(): ShopTimezoneContextValue {
  const ctx = useContext(ShopTimezoneContext);
  if (!ctx) {
    throw new Error('useShopTimezone must be used within ShopTimezoneProvider');
  }
  return ctx;
}
