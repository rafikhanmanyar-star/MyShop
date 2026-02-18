import React, { createContext, useContext, type ReactNode } from 'react';

interface BIContextValue {
  salesData: any[];
  inventoryData: any[];
  profitabilityData: any[];
  kpis: any[];
  storePerformance: any[];
  storeRankings: any[];
  salesTrend: any[];
  categoryPerformance: any[];
  dateRange: any;
  setDateRange: (range: any) => void;
  loading: boolean;
  refreshData: () => Promise<void>;
  [key: string]: any;
}

const defaultValue: BIContextValue = {
  salesData: [], inventoryData: [], profitabilityData: [], kpis: [],
  storePerformance: [], storeRankings: [], salesTrend: [], categoryPerformance: [],
  dateRange: '30d', setDateRange: () => {},
  loading: false, refreshData: async () => {},
};

const BIContext = createContext<BIContextValue>(defaultValue);

export function BIProvider({ children }: { children: ReactNode }) {
  return <BIContext.Provider value={defaultValue}>{children}</BIContext.Provider>;
}

export function useBI() {
  return useContext(BIContext);
}
