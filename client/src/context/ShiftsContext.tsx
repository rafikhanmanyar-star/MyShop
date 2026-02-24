import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { shiftsApi } from '../services/shopApi';

export interface CashierShift {
  id: string;
  tenant_id: string;
  cashier_id: string;
  terminal_id: string;
  opening_cash: number;
  opening_time: string;
  closing_cash_expected: number | null;
  closing_cash_actual: number | null;
  variance_amount: number | null;
  variance_reason: string | null;
  status: 'open' | 'closed';
  handed_over_to: string | null;
  closing_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftStats {
  totalSales: number;
  totalTransactions: number;
  averageBillValue: number;
  totalItemsSold: number;
  paymentBreakdown: { method: string; amount: number }[];
  cashCollected: number;
  cardCollected: number;
  bankTransfer: number;
  mobileWallet: number;
  creditSales: number;
  totalRefundAmount: number;
  refundCount: number;
  pettyCashUsed: number;
  shiftExpenses: number;
  expectedCash: number;
}

interface ShiftsContextValue {
  currentShift: CashierShift | null;
  currentTerminalId: string | null;
  setCurrentTerminalId: (id: string | null) => void;
  refreshCurrentShift: () => Promise<void>;
  startShift: (terminalId: string, openingCash: number) => Promise<CashierShift>;
  isLoading: boolean;
  error: string | null;
}

const ShiftsContext = createContext<ShiftsContextValue | undefined>(undefined);

export function ShiftsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentShift, setCurrentShift] = useState<CashierShift | null>(null);
  const [currentTerminalId, setCurrentTerminalId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCurrentShift = useCallback(async () => {
    if (!user || (user.role !== 'pos_cashier' && user.role !== 'admin')) {
      setCurrentShift(null);
      setIsLoading(false);
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const shift = await shiftsApi.getCurrent(currentTerminalId ?? undefined);
      setCurrentShift(shift);
    } catch (e: any) {
      setError(e?.message || e?.error || 'Failed to load shift');
      setCurrentShift(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentTerminalId]);

  useEffect(() => {
    refreshCurrentShift();
    const t = setInterval(refreshCurrentShift, 60000);
    return () => clearInterval(t);
  }, [refreshCurrentShift]);

  const startShift = useCallback(async (terminalId: string, openingCash: number): Promise<CashierShift> => {
    const shift = await shiftsApi.start(terminalId, openingCash);
    setCurrentShift(shift);
    setCurrentTerminalId(terminalId);
    return shift;
  }, []);

  const value: ShiftsContextValue = {
    currentShift,
    currentTerminalId,
    setCurrentTerminalId,
    refreshCurrentShift,
    startShift,
    isLoading,
    error,
  };

  return <ShiftsContext.Provider value={value}>{children}</ShiftsContext.Provider>;
}

export function useShifts(): ShiftsContextValue {
  const ctx = useContext(ShiftsContext);
  if (ctx === undefined) {
    return {
      currentShift: null,
      currentTerminalId: null,
      setCurrentTerminalId: () => {},
      refreshCurrentShift: async () => {},
      startShift: async () => ({} as CashierShift),
      isLoading: false,
      error: null,
    };
  }
  return ctx;
}
