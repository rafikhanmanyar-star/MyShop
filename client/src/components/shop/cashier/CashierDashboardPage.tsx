import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  ShoppingCart,
  Receipt,
  CreditCard,
  Banknote,
  TrendingUp,
  AlertCircle,
  LogIn,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { useShifts, type CashierShift, type ShiftStats } from '../../../context/ShiftsContext';
import { shiftsApi } from '../../../services/shopApi';
import { shopApi } from '../../../services/shopApi';
import { getBranchesCache, setBranchesCache, getTerminalsCache, setTerminalsCache, getTenantId } from '../../../services/branchesTerminalsCache';
import { useOnline } from '../../../hooks/useOnline';
import { CURRENCY } from '../../../constants';
import TerminalCloseModal from './TerminalCloseModal';

export default function CashierDashboardPage() {
  const isOnline = useOnline();
  const { currentShift, currentTerminalId, setCurrentTerminalId, refreshCurrentShift, startShift, isLoading, error } = useShifts();
  const [stats, setStats] = useState<ShiftStats | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [startForm, setStartForm] = useState({ branchId: '', terminalId: '', openingCash: '' });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);

  const loadBranches = useCallback(() => {
    const tenantId = getTenantId();
    if (isOnline) {
      shopApi.getBranches()
        .then((list) => {
          setBranches(Array.isArray(list) ? list : []);
          if (tenantId) setBranchesCache(tenantId, Array.isArray(list) ? list : []).catch(() => {});
        })
        .catch(() => {
          if (tenantId) getBranchesCache(tenantId).then((c) => { if (c?.length) setBranches(c); });
          setBranches([]);
        });
    } else if (tenantId) {
      getBranchesCache(tenantId).then((c) => setBranches(c ?? []));
    }
  }, [isOnline]);
  const loadTerminals = useCallback(() => {
    const tenantId = getTenantId();
    if (isOnline) {
      shopApi.getTerminals()
        .then((list) => {
          setTerminals(Array.isArray(list) ? list : []);
          if (tenantId) setTerminalsCache(tenantId, Array.isArray(list) ? list : []).catch(() => {});
        })
        .catch(() => {
          if (tenantId) getTerminalsCache(tenantId).then((c) => { if (c?.length) setTerminals(c); });
          setTerminals([]);
        });
    } else if (tenantId) {
      getTerminalsCache(tenantId).then((c) => setTerminals(c ?? []));
    }
  }, [isOnline]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);
  useEffect(() => {
    loadTerminals();
  }, [loadTerminals]);

  // Terminals belong to a branch: filter by selected location (branch)
  const terminalsForBranch = startForm.branchId
    ? terminals.filter((t: any) => String(t.branch_id ?? t.branchId ?? '') === String(startForm.branchId))
    : [];

  const loadStats = useCallback(() => {
    if (!currentShift?.id) {
      setStats(null);
      return;
    }
    shiftsApi
      .getStats(currentShift.id)
      .then(setStats)
      .catch(() => setStats(null));
  }, [currentShift?.id]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 15000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const handleStartShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const terminalId = startForm.terminalId.trim();
    const openingCash = parseFloat(startForm.openingCash);
    if (!startForm.branchId || !terminalId || isNaN(openingCash) || openingCash < 0) {
      setStartError('Select location, terminal, and enter opening cash amount.');
      return;
    }
    setStartError(null);
    setStarting(true);
    try {
      await startShift(terminalId, openingCash);
      setStartForm({ branchId: '', terminalId: '', openingCash: '' });
    } catch (err: any) {
      setStartError(err?.message || err?.error || 'Failed to start shift');
    } finally {
      setStarting(false);
    }
  };

  const handleCloseSuccess = () => {
    refreshCurrentShift();
    setStats(null);
  };

  if (isLoading && !currentShift) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 flex items-center gap-4">
        <AlertCircle className="w-10 h-10 text-amber-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-amber-800">Could not load shift</p>
          <p className="text-sm text-amber-700">{error}</p>
          <button
            type="button"
            onClick={() => refreshCurrentShift()}
            className="mt-2 text-sm font-medium text-amber-700 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!currentShift) {
    return (
      <div className="max-w-md mx-auto">
        {!isOnline && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm border border-amber-200">
            Offline — Connect to the internet to start a shift.
          </div>
        )}
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <LogIn className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Start your shift</h1>
              <p className="text-sm text-slate-500">Enter opening cash and confirm terminal</p>
            </div>
          </div>
          <form onSubmit={handleStartShift} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
              <select
                value={startForm.branchId}
                onChange={(e) => setStartForm((f) => ({ ...f, branchId: e.target.value, terminalId: '' }))}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">— Select location (branch) —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {branches.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">No locations. Ask admin to add branches in Multi-Store.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Terminal</label>
              <select
                value={startForm.terminalId}
                onChange={(e) => setStartForm((f) => ({ ...f, terminalId: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                required
                disabled={!startForm.branchId}
              >
                <option value="">— Select terminal —</option>
                {terminalsForBranch.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code ?? t.id})
                  </option>
                ))}
              </select>
              {startForm.branchId && terminalsForBranch.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">No terminals at this location. Ask admin to add a terminal in Multi-Store.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Opening cash (amount in drawer)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={startForm.openingCash}
                onChange={(e) => setStartForm((f) => ({ ...f, openingCash: e.target.value }))}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            {startError && (
              <p className="text-sm text-rose-600">{startError}</p>
            )}
            <button
              type="submit"
              disabled={starting || !isOnline}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {starting ? 'Starting…' : isOnline ? 'Start shift' : 'Start shift (offline)'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!isOnline && (
        <div className="p-3 rounded-xl bg-amber-50 text-amber-800 text-sm border border-amber-200">
          Offline — Connect to the internet to close your shift or refresh stats.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My shift</h1>
          <p className="text-slate-500 text-sm">
            Started {new Date(currentShift.opening_time).toLocaleString()}
            {currentShift.terminal_id && terminals.length && (
              <> · {terminals.find((t) => t.id === currentShift.terminal_id)?.name || currentShift.terminal_id}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { refreshCurrentShift(); loadStats(); }}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setCloseModalOpen(true)}
            disabled={!isOnline}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-100 text-rose-700 font-semibold hover:bg-rose-200 disabled:opacity-50"
          >
            <LogOut className="w-5 h-5" />
            Close terminal
          </button>
        </div>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-sm font-medium text-slate-500">Total sales</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {CURRENCY} {Number(stats.totalSales).toFixed(2)}
              </p>
              <p className="text-xs text-slate-400">{stats.totalTransactions} transactions</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                </div>
                <span className="text-sm font-medium text-slate-500">Avg. bill</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {CURRENCY} {Number(stats.averageBillValue).toFixed(2)}
              </p>
              <p className="text-xs text-slate-400">{stats.totalItemsSold} items sold</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-amber-600" />
                </div>
                <span className="text-sm font-medium text-slate-500">Expected cash</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {CURRENCY} {Number(stats.expectedCash).toFixed(2)}
              </p>
              <p className="text-xs text-slate-400">Opening + Cash sales − Refunds − Expenses</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-slate-600" />
                </div>
                <span className="text-sm font-medium text-slate-500">Cash collected</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {CURRENCY} {Number(stats.cashCollected).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Payment breakdown</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-slate-600">Cash</span>
                  <span className="font-medium">{CURRENCY} {Number(stats.cashCollected).toFixed(2)}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-600">Card</span>
                  <span className="font-medium">{CURRENCY} {Number(stats.cardCollected).toFixed(2)}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-600">Bank transfer</span>
                  <span className="font-medium">{CURRENCY} {Number(stats.bankTransfer).toFixed(2)}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-600">Mobile wallet</span>
                  <span className="font-medium">{CURRENCY} {Number(stats.mobileWallet).toFixed(2)}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-600">Credit</span>
                  <span className="font-medium">{CURRENCY} {Number(stats.creditSales).toFixed(2)}</span>
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Refunds & expenses</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-slate-600">Refunds</span>
                  <span className="font-medium">{stats.refundCount} · {CURRENCY} {Number(stats.totalRefundAmount).toFixed(2)}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-600">Shift expenses / petty cash</span>
                  <span className="font-medium">{CURRENCY} {Number(stats.pettyCashUsed).toFixed(2)}</span>
                </li>
              </ul>
            </div>
          </div>
        </>
      )}

      {closeModalOpen && currentShift && stats && (
        <TerminalCloseModal
          shiftId={currentShift.id}
          stats={{
            opening_cash: currentShift.opening_cash,
            expectedCash: stats.expectedCash,
            cashCollected: stats.cashCollected,
            totalRefundAmount: stats.totalRefundAmount,
            pettyCashUsed: stats.pettyCashUsed,
            totalSales: stats.totalSales,
            totalTransactions: stats.totalTransactions,
            paymentBreakdown: stats.paymentBreakdown,
          }}
          onClose={() => setCloseModalOpen(false)}
          onSuccess={handleCloseSuccess}
        />
      )}
    </div>
  );
}
