import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { shopApi } from '../services/shopApi';

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
  refreshAccounts: async () => { },
  createAccount: async () => ({}),
  postJournalEntry: async () => ({}),
};

const AccountingContext = createContext<AccountingContextValue>(defaultValue);

export function AccountingProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const list = await shopApi.getBankAccounts(false);
      // Map bank accounts to a format ChartOfAccounts component expects
      setAccounts((list || []).map((acc: any) => ({
        id: acc.id,
        code: acc.code || 'UNCODED',
        name: acc.name,
        type: acc.account_type === 'Bank' ? 'Asset' : (acc.account_type || 'Asset'),
        balance: 0, // In this simple implementation, balance is not tracked in the table
        isActive: acc.is_active,
        isControlAccount: false
      })));
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createAccount = async (data: any) => {
    try {
      const result = await shopApi.createBankAccount({
        name: data.name,
        code: data.code,
        account_type: data.type,
        currency: 'PKR' // Default currency from constants
      });
      await refreshAccounts();
      return result;
    } catch (error) {
      console.error('Failed to create account:', error);
      throw error;
    }
  };

  const postJournalEntry = async (data: any) => {
    console.log('Post journal entry (not implemented in backend):', data);
    return { success: true };
  };

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  const value: AccountingContextValue = {
    ...defaultValue,
    accounts,
    loading,
    refreshAccounts,
    createAccount,
    postJournalEntry,
  };

  return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>;
}

export function useAccounting() {
  return useContext(AccountingContext);
}
