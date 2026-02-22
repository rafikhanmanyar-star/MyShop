import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { accountingApi } from '../services/shopApi';

interface AccountingContextValue {
  accounts: any[];
  journalEntries: any[];
  entries: any[];
  bankAccounts: any[];
  loading: boolean;
  totalRevenue: number;
  grossProfit: number;
  netMargin: number;
  totalCOGS: number;
  totalExpenses: number;
  netProfit: number;
  receivablesTotal: number;
  payablesTotal: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  salesBySource: { pos: any; mobile: any } | null;
  refreshAccounts: () => Promise<void>;
  refreshAll: () => Promise<void>;
  createAccount: (data: any) => Promise<any>;
  postJournalEntry: (data: any) => Promise<any>;
  [key: string]: any;
}

const defaultValue: AccountingContextValue = {
  accounts: [], journalEntries: [], entries: [], bankAccounts: [], loading: false,
  totalRevenue: 0, grossProfit: 0, netMargin: 0, totalCOGS: 0, totalExpenses: 0,
  netProfit: 0, receivablesTotal: 0, payablesTotal: 0,
  totalAssets: 0, totalLiabilities: 0, totalEquity: 0,
  salesBySource: null,
  refreshAccounts: async () => { },
  refreshAll: async () => { },
  createAccount: async () => ({}),
  postJournalEntry: async () => ({}),
};

const AccountingContext = createContext<AccountingContextValue>(defaultValue);

export function AccountingProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [salesBySource, setSalesBySource] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const refreshAccounts = useCallback(async () => {
    try {
      const list = await accountingApi.getAccounts();
      setAccounts((list || []).map((acc: any) => ({
        id: acc.id,
        code: acc.code || 'UNCODED',
        name: acc.name,
        type: acc.type,
        balance: parseFloat(acc.balance) || 0,
        totalDebit: parseFloat(acc.total_debit) || 0,
        totalCredit: parseFloat(acc.total_credit) || 0,
        isActive: acc.is_active,
        isControlAccount: false
      })));
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  }, []);

  const refreshJournalEntries = useCallback(async () => {
    try {
      const entries = await accountingApi.getJournalEntries();
      setJournalEntries(entries || []);
    } catch (error) {
      console.error('Failed to fetch journal entries:', error);
    }
  }, []);

  const refreshSummary = useCallback(async () => {
    try {
      const data = await accountingApi.getFinancialSummary();
      setSummary(data || {});
    } catch (error) {
      console.error('Failed to fetch financial summary:', error);
    }
  }, []);

  const refreshBankBalances = useCallback(async () => {
    try {
      const data = await accountingApi.getBankBalances();
      setBankAccounts(data || []);
    } catch (error) {
      console.error('Failed to fetch bank balances:', error);
    }
  }, []);

  const refreshSalesBySource = useCallback(async () => {
    try {
      const data = await accountingApi.getSalesBySource();
      setSalesBySource(data || null);
    } catch (error) {
      console.error('Failed to fetch sales by source:', error);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        refreshAccounts(),
        refreshJournalEntries(),
        refreshSummary(),
        refreshBankBalances(),
        refreshSalesBySource(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [refreshAccounts, refreshJournalEntries, refreshSummary, refreshBankBalances, refreshSalesBySource]);

  const createAccount = async (data: any) => {
    try {
      const result = await accountingApi.postJournalEntry(data); // Uses manual entry endpoint
      await refreshAll();
      return result;
    } catch (error) {
      console.error('Failed to create account:', error);
      throw error;
    }
  };

  const postJournalEntry = async (data: any) => {
    try {
      const result = await accountingApi.postJournalEntry(data);
      await refreshAll();
      return result;
    } catch (error) {
      console.error('Failed to post journal entry:', error);
      throw error;
    }
  };

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const value: AccountingContextValue = {
    ...defaultValue,
    accounts,
    journalEntries,
    entries: journalEntries, // alias for backward compat
    bankAccounts,
    loading,
    totalRevenue: parseFloat(summary.totalRevenue) || 0,
    grossProfit: parseFloat(summary.grossProfit) || 0,
    netMargin: parseFloat(summary.netMargin) || 0,
    totalCOGS: parseFloat(summary.totalCOGS) || 0,
    totalExpenses: parseFloat(summary.totalExpenses) || 0,
    netProfit: parseFloat(summary.netProfit) || 0,
    receivablesTotal: parseFloat(summary.receivablesTotal) || 0,
    payablesTotal: 0,
    totalAssets: parseFloat(summary.totalAssets) || 0,
    totalLiabilities: parseFloat(summary.totalLiabilities) || 0,
    totalEquity: parseFloat(summary.totalEquity) || 0,
    salesBySource,
    refreshAccounts,
    refreshAll,
    createAccount,
    postJournalEntry,
  };

  return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>;
}

export function useAccounting() {
  return useContext(AccountingContext);
}
