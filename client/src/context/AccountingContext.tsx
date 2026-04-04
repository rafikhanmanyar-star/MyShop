import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { accountingApi } from '../services/shopApi';
import { getAccountingCache, setAccountingCache } from '../services/accountingSyncService';
import { getTenantId } from '../services/posOfflineDb';
import {
  createAccountOfflineFirst,
  updateAccountOfflineFirst,
  deleteAccountOfflineFirst,
  postJournalEntryOfflineFirst,
} from '../services/accountingSyncService';

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
  updateAccount: (id: string, data: any) => Promise<any>;
  deleteAccount: (id: string) => Promise<any>;
  postJournalEntry: (data: any) => Promise<any>;
  updateJournalEntry: (id: string, data: any) => Promise<any>;
  deleteJournalEntry: (id: string) => Promise<any>;
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
  updateAccount: async () => ({}),
  deleteAccount: async () => ({}),
  postJournalEntry: async () => ({}),
  updateJournalEntry: async () => ({}),
  deleteJournalEntry: async () => ({}),
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
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
      try {
        const list = await accountingApi.getAccounts();
        const mapped = (list || []).map((acc: any) => ({
          id: acc.id,
          code: acc.code || 'UNCODED',
          name: acc.name,
          type: acc.type,
          balance: parseFloat(acc.balance) || 0,
          totalDebit: parseFloat(acc.total_debit) || 0,
          totalCredit: parseFloat(acc.total_credit) || 0,
          isActive: acc.is_active,
          isControlAccount: false
        }));
        setAccounts(mapped);
        return;
      } catch {
        if (tenantId) {
          const cached = await getAccountingCache(tenantId);
          if (cached?.data?.accounts?.length) {
            setAccounts(cached.data.accounts);
          }
        }
        return;
      }
    }
    if (tenantId) {
      const cached = await getAccountingCache(tenantId);
      if (cached?.data?.accounts?.length) setAccounts(cached.data.accounts);
    }
  }, []);

  const refreshJournalEntries = useCallback(async () => {
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
      try {
        const entries = await accountingApi.getJournalEntries();
        setJournalEntries(entries || []);
        return;
      } catch {
        if (tenantId) {
          const cached = await getAccountingCache(tenantId);
          if (cached?.data?.journalEntries?.length) setJournalEntries(cached.data.journalEntries);
        }
        return;
      }
    }
    if (tenantId) {
      const cached = await getAccountingCache(tenantId);
      if (cached?.data?.journalEntries?.length) setJournalEntries(cached.data.journalEntries);
    }
  }, []);

  const refreshSummary = useCallback(async () => {
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
      try {
        const data = await accountingApi.getFinancialSummary();
        setSummary(data || {});
        return;
      } catch {
        if (tenantId) {
          const cached = await getAccountingCache(tenantId);
          if (cached?.data?.summary) setSummary(cached.data.summary);
        }
        return;
      }
    }
    if (tenantId) {
      const cached = await getAccountingCache(tenantId);
      if (cached?.data?.summary) setSummary(cached.data.summary);
    }
  }, []);

  const refreshBankBalances = useCallback(async () => {
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
      try {
        const data = await accountingApi.getBankBalances();
        setBankAccounts(data || []);
        return;
      } catch {
        if (tenantId) {
          const cached = await getAccountingCache(tenantId);
          if (cached?.data?.bankBalances?.length) setBankAccounts(cached.data.bankBalances);
        }
        return;
      }
    }
    if (tenantId) {
      const cached = await getAccountingCache(tenantId);
      if (cached?.data?.bankBalances?.length) setBankAccounts(cached.data.bankBalances);
    }
  }, []);

  const refreshSalesBySource = useCallback(async () => {
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
      try {
        const data = await accountingApi.getSalesBySource();
        setSalesBySource(data || null);
        return;
      } catch {
        if (tenantId) {
          const cached = await getAccountingCache(tenantId);
          if (cached?.data?.salesBySource) setSalesBySource(cached.data.salesBySource);
        }
        return;
      }
    }
    if (tenantId) {
      const cached = await getAccountingCache(tenantId);
      if (cached?.data?.salesBySource) setSalesBySource(cached.data.salesBySource);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    try {
      if (isOnline && tenantId) {
        try {
          const [accounts, journalEntries, summary, bankBalances, salesBySource] = await Promise.all([
            accountingApi.getAccounts().catch(() => []),
            accountingApi.getJournalEntries().catch(() => []),
            accountingApi.getFinancialSummary().catch(() => ({})),
            accountingApi.getBankBalances().catch(() => []),
            accountingApi.getSalesBySource().catch(() => null),
          ]);
          const data = {
            accounts: accounts || [],
            journalEntries: journalEntries || [],
            summary: summary || {},
            bankBalances: bankBalances || [],
            salesBySource: salesBySource ?? null,
          };
          await setAccountingCache(tenantId, data);
          setAccounts((data.accounts || []).map((acc: any) => ({
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
          setJournalEntries(data.journalEntries || []);
          setSummary(data.summary || {});
          setBankAccounts(data.bankBalances || []);
          setSalesBySource(data.salesBySource ?? null);
          return;
        } catch {
          // fall through to cache read
        }
      }
      if (tenantId) {
        const cached = await getAccountingCache(tenantId);
        if (cached?.data) {
          const d = cached.data;
          setAccounts((d.accounts || []).map((acc: any) => ({
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
          setJournalEntries(d.journalEntries || []);
          setSummary(d.summary || {});
          setBankAccounts(d.bankBalances || []);
          setSalesBySource(d.salesBySource ?? null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const offlineQueueMessage =
    'Could not save to the server right now. Changes were saved only on this device and will sync when the connection is stable. If another user is editing Settings at the same time, wait until they finish and try again.';

  const createAccount = async (data: any) => {
    const result = await createAccountOfflineFirst(data);
    if (result.synced) await refreshAll();
    else if (result.localId) {
      alert(offlineQueueMessage);
    }
    return { synced: !!result.synced, localId: result.localId, value: result.result };
  };

  const updateAccount = async (id: string, data: any) => {
    const result = await updateAccountOfflineFirst(id, data);
    if (result.synced) await refreshAll();
    else if (result.localId) {
      alert(offlineQueueMessage);
    }
    return { synced: !!result.synced, localId: result.localId, value: result.result };
  };

  const deleteAccount = async (id: string) => {
    const result = await deleteAccountOfflineFirst(id);
    if (result.synced) await refreshAll();
    else if (result.localId) {
      alert(offlineQueueMessage);
    }
    return { synced: !!result.synced, localId: result.localId };
  };

  const postJournalEntry = async (data: any) => {
    const result = await postJournalEntryOfflineFirst(data);
    if (result.synced) await refreshAll();
    else if (result.localId) {
      alert(offlineQueueMessage);
    }
    return { synced: !!result.synced, localId: result.localId, value: result.result };
  };

  const updateJournalEntry = async (id: string, data: any) => {
    await accountingApi.updateJournalEntry(id, data);
    await refreshAll();
  };

  const deleteJournalEntry = async (id: string) => {
    await accountingApi.deleteJournalEntry(id);
    await refreshAll();
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
    updateAccount,
    deleteAccount,
    postJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
  };

  return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>;
}

export function useAccounting() {
  return useContext(AccountingContext);
}
