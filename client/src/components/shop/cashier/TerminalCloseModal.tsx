import React, { useState, useEffect } from 'react';
import { X, Wallet, UserCheck, AlertCircle } from 'lucide-react';
import { shiftsApi, shopApi } from '../../../services/shopApi';

interface TerminalCloseModalProps {
  shiftId: string;
  stats: {
    opening_cash: number;
    expectedCash: number;
    cashCollected: number;
    totalRefundAmount: number;
    pettyCashUsed: number;
    totalSales: number;
    totalTransactions: number;
    paymentBreakdown: { method: string; amount: number }[];
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function TerminalCloseModal({ shiftId, stats, onClose, onSuccess }: TerminalCloseModalProps) {
  const [closingCashActual, setClosingCashActual] = useState('');
  const [varianceReason, setVarianceReason] = useState('');
  const [handoverToUserId, setHandoverToUserId] = useState('');
  const [handoverAmount, setHandoverAmount] = useState('');
  const [recipients, setRecipients] = useState<{ id: string; name: string; role: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actualNum = parseFloat(closingCashActual) || 0;
  const variance = actualNum - stats.expectedCash;
  const hasVariance = Math.abs(variance) >= 0.01;

  useEffect(() => {
    shiftsApi.getHandoverRecipients().then(setRecipients).catch(() => setRecipients([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasVariance && !varianceReason.trim()) {
      setError('Please provide a reason for the variance.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await shiftsApi.close(shiftId, {
        closingCashActual: actualNum,
        varianceReason: varianceReason.trim() || undefined,
        handoverToUserId: handoverToUserId || undefined,
        handoverAmount: handoverAmount ? parseFloat(handoverAmount) : undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || err?.error || 'Failed to close shift');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Close Terminal</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-muted/80 rounded-xl p-4">
              <p className="text-muted-foreground font-medium">Opening Cash</p>
              <p className="text-lg font-bold text-foreground">{Number(stats.opening_cash).toFixed(2)}</p>
            </div>
            <div className="bg-muted/80 rounded-xl p-4">
              <p className="text-muted-foreground font-medium">Cash Sales</p>
              <p className="text-lg font-bold text-foreground">{Number(stats.cashCollected).toFixed(2)}</p>
            </div>
            <div className="bg-muted/80 rounded-xl p-4">
              <p className="text-muted-foreground font-medium">Refunds</p>
              <p className="text-lg font-bold text-foreground">-{Number(stats.totalRefundAmount).toFixed(2)}</p>
            </div>
            <div className="bg-muted/80 rounded-xl p-4">
              <p className="text-muted-foreground font-medium">Expenses</p>
              <p className="text-lg font-bold text-foreground">-{Number(stats.pettyCashUsed).toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <p className="text-indigo-700 font-semibold">Expected Cash in Drawer</p>
            <p className="text-2xl font-bold text-indigo-900">{Number(stats.expectedCash).toFixed(2)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Actual Cash Counted *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={closingCashActual}
              onChange={(e) => setClosingCashActual(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          <div className="rounded-xl p-4 border bg-muted/80">
            <p className="text-sm font-medium text-muted-foreground">Variance (Actual − Expected)</p>
            <p className={`text-xl font-bold ${variance < 0 ? 'text-rose-600' : variance > 0 ? 'text-emerald-600' : 'text-foreground'}`}>
              {variance.toFixed(2)} {variance < 0 ? '(Shortage)' : variance > 0 ? '(Excess)' : ''}
            </p>
            {hasVariance && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-foreground mb-1">Reason for variance *</label>
                <textarea
                  value={varianceReason}
                  onChange={(e) => setVarianceReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Counting error, petty cash used..."
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Hand over to</label>
            <select
              value={handoverToUserId}
              onChange={(e) => setHandoverToUserId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select —</option>
              {recipients.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role === 'admin' ? 'Admin' : 'Cashier'})
                </option>
              ))}
            </select>
          </div>

          {handoverToUserId && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Handover amount (optional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={handoverAmount}
                onChange={(e) => setHandoverAmount(e.target.value)}
                placeholder={String(stats.expectedCash)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-300 text-foreground font-medium hover:bg-muted/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Closing…' : 'Close shift & hand over'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
