import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { shopApi } from '../services/shopApi';
import { getAppContext, setAppContext } from '../services/appContext';
import { apiClient } from '../services/apiClient';

interface BranchContextType {
  branches: { id: string; name: string; code?: string }[];
  selectedBranchId: string | null;
  selectedBranchName: string;
  setBranch: (branchId: string) => void;
  isSwitchModalOpen: boolean;
  setSwitchModalOpen: (open: boolean) => void;
  refetchBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [branches, setBranches] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(null);
  const [isSwitchModalOpen, setSwitchModalOpen] = useState(false);

  const loadBranches = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const list = await shopApi.getBranches();
      setBranches(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Failed to load branches:', e);
      setBranches([]);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSelectedBranchIdState(null);
      return;
    }
    const ctx = getAppContext();
    setSelectedBranchIdState(ctx.branch_id);
  }, [isAuthenticated]);

  useEffect(() => {
    const handler = () => {
      const ctx = getAppContext();
      setSelectedBranchIdState(ctx.branch_id);
    };
    window.addEventListener('branch-changed', handler);
    return () => window.removeEventListener('branch-changed', handler);
  }, []);

  const setBranch = useCallback((branchId: string) => {
    setAppContext({ branch_id: branchId, selected_by_qr: false });
    apiClient.setBranchId(branchId);
    setSelectedBranchIdState(branchId);
    setSwitchModalOpen(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('branch-changed', { detail: { branchId } }));
    }
  }, []);

  const selectedBranchName = selectedBranchId
    ? (branches.find((b) => b.id === selectedBranchId)?.name ?? selectedBranchId)
    : '—';

  const value: BranchContextType = {
    branches,
    selectedBranchId,
    selectedBranchName,
    setBranch,
    isSwitchModalOpen,
    setSwitchModalOpen,
    refetchBranches: loadBranches,
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within BranchProvider');
  return ctx;
}
