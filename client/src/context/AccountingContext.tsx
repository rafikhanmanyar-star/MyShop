import React, { createContext, useContext, type ReactNode } from 'react';

interface AccountingContextValue {
  accounts: any[];
  journalEntries: any[];
  entries: any[];
  loading: boolean;
  totalRevenue: number;
  grossProfit: number;
  netMargin: number;
  receivablesTotal: number;
  payablesTotal: number;
  refreshAccounts: () => Promise<void>;
  createAccount: (data: any) => Promise<any>;
  postJournalEntry: (data: any) => Promise<any>;
  [key: string]: any;
}

const defaultValue: AccountingContextValue = {
  accounts: [], journalEntries: [], entries: [], loading: false,
  totalRevenue: 0, grossProfit: 0, netMargin: 0, receivablesTotal: 0, payablesTotal: 0,
  refreshAccounts: async () => {},
  createAccount: async () => ({}),
  postJournalEntry: async () => ({}),
};

const AccountingContext = createContext<AccountingContextValue>(defaultValue);

export function AccountingProvider({ children }: { children: ReactNode }) {
  return <AccountingContext.Provider value={defaultValue}>{children}</AccountingContext.Provider>;
}

export function useAccounting() {
  return useContext(AccountingContext);
}
