import React, { useState, useEffect, useCallback } from 'react';
import { khataApi, KhataLedgerEntry, KhataSummaryRow } from '../../../services/shopApi';
import { ICONS, CURRENCY } from '../../../constants';
import Modal from '../../ui/Modal';
import Card from '../../ui/Card';

const KhataPage: React.FC = () => {
  const [summary, setSummary] = useState<KhataSummaryRow[]>([]);
  const [ledger, setLedger] = useState<KhataLedgerEntry[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveCustomerId, setReceiveCustomerId] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveNote, setReceiveNote] = useState('');
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string; contact_no: string | null }[]>([]);
  const [editingEntry, setEditingEntry] = useState<KhataLedgerEntry | null>(null);
  const [editType, setEditType] = useState<'debit' | 'credit'>('debit');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [entryPendingDelete, setEntryPendingDelete] = useState<KhataLedgerEntry | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const data = await khataApi.getSummary();
      setSummary(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Khata summary failed', e);
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLedger = useCallback(async (customerId: string | null) => {
    if (!customerId) {
      setLedger([]);
      return;
    }
    try {
      const data = await khataApi.getLedger(customerId);
      setLedger(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Khata ledger failed', e);
      setLedger([]);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const data = await khataApi.getCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setCustomers([]);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadLedger(selectedCustomerId);
  }, [selectedCustomerId, loadLedger]);

  useEffect(() => {
    if (receiveModalOpen) loadCustomers();
  }, [receiveModalOpen, loadCustomers]);

  const openReceiveModal = () => {
    setReceiveCustomerId('');
    setReceiveAmount('');
    setReceiveNote('');
    setReceiveModalOpen(true);
  };

  const refreshSummaryAndLedger = useCallback(async () => {
    let arr: KhataSummaryRow[] = [];
    try {
      const data = await khataApi.getSummary();
      arr = Array.isArray(data) ? data : [];
      setSummary(arr);
    } catch {
      setSummary([]);
    }
    const stillListed =
      selectedCustomerId != null && arr.some((r) => r.customer_id === selectedCustomerId);
    if (!stillListed && selectedCustomerId) {
      setSelectedCustomerId(null);
      setSelectedCustomerName('');
      setLedger([]);
    } else if (stillListed && selectedCustomerId) {
      await loadLedger(selectedCustomerId);
    }
  }, [selectedCustomerId, loadLedger]);

  const openEditEntry = (entry: KhataLedgerEntry) => {
    setEditingEntry(entry);
    setEditType(entry.type);
    setEditAmount(String(entry.amount));
    setEditNote(entry.note ?? '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    const amount = parseFloat(editAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setEditSubmitting(true);
    try {
      await khataApi.updateLedgerEntry(editingEntry.id, {
        type: editType,
        amount,
        note: editNote.trim() || null,
      });
      setEditingEntry(null);
      await refreshSummaryAndLedger();
    } catch (err) {
      console.error('Update khata entry failed', err);
      alert('Failed to update entry. Please try again.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!entryPendingDelete) return;
    setDeleteSubmitting(true);
    try {
      await khataApi.deleteLedgerEntry(entryPendingDelete.id);
      setEntryPendingDelete(null);
      await refreshSummaryAndLedger();
    } catch (err) {
      console.error('Delete khata entry failed', err);
      alert('Failed to delete entry. Please try again.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(receiveAmount);
    if (!receiveCustomerId || !amount || amount <= 0) return;
    setReceiveSubmitting(true);
    try {
      await khataApi.receivePayment({
        customerId: receiveCustomerId,
        amount,
        note: receiveNote.trim() || undefined,
      });
      setReceiveModalOpen(false);
      setReceiveCustomerId('');
      setReceiveAmount('');
      setReceiveNote('');
      await refreshSummaryAndLedger();
    } catch (err) {
      console.error('Receive payment failed', err);
      alert('Failed to record payment. Please try again.');
    } finally {
      setReceiveSubmitting(false);
    }
  };

  const totalBalance = summary.reduce((s, r) => s + r.balance, 0);

  return (
    <div className="flex flex-col h-full bg-muted/80 -m-4 md:-m-8">
      <div className="bg-card border-b border-border px-6 md:px-8 py-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Customer Khata Ledger</h1>
            <p className="text-muted-foreground text-sm mt-1">Credit sales and payments. Balance = Debit − Credit.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openReceiveModal}
              className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-emerald-700 transition-colors"
            >
              {ICONS.plus}
              Receive Payment
            </button>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-2xl bg-muted border border-border">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total outstanding (all customers)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-muted-foreground font-mono text-lg">{CURRENCY}</span>
            <span className={`text-2xl font-black font-mono ${totalBalance > 0 ? 'text-amber-600' : 'text-foreground'}`}>
              {totalBalance.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-muted/80/80">
                <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Customers with balance</h2>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {summary.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground text-sm">No khata entries yet. Use Khata / Credit at POS to record credit sales.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {summary.map((row) => (
                      <li key={row.customer_id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomerId(row.customer_id);
                            setSelectedCustomerName(row.customer_name);
                          }}
                          className={`w-full text-left px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors ${selectedCustomerId === row.customer_id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''}`}
                        >
                          <div>
                            <span className="font-bold text-foreground">{row.customer_name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-muted-foreground font-mono">
                              {CURRENCY} {row.balance.toLocaleString()}
                            </span>
                            <span className="text-slate-300">{ICONS.chevronRight && React.cloneElement(ICONS.chevronRight as React.ReactElement, { className: 'w-4 h-4' })}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            <Card className="p-0 overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-border bg-muted/80/80 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  {selectedCustomerId ? `Ledger: ${selectedCustomerName}` : 'Transaction history'}
                </h2>
                {selectedCustomerId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId(null);
                      setSelectedCustomerName('');
                    }}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-[200px] max-h-[400px] overflow-y-auto">
                {!selectedCustomerId ? (
                  <div className="p-12 text-center text-muted-foreground text-sm">Select a customer to view their ledger.</div>
                ) : ledger.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground text-sm">No transactions for this customer.</div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/80 sticky top-0 text-[10px] font-black uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right w-[1%] whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledger.map((entry) => (
                        <tr key={entry.id} className="hover:bg-muted/50/50">
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-bold ${entry.type === 'debit' ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {entry.type === 'debit' ? 'Debit' : 'Credit'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{entry.note || entry.sale_number || '—'}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            {entry.type === 'debit' ? '+' : '-'}{CURRENCY} {entry.amount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditEntry(entry)}
                                className="p-2 rounded-lg text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                                title="Edit entry"
                                aria-label="Edit entry"
                              >
                                {React.cloneElement(ICONS.edit as React.ReactElement, { className: 'w-4 h-4' })}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEntryPendingDelete(entry)}
                                className="p-2 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                title="Delete entry"
                                aria-label="Delete entry"
                              >
                                {React.cloneElement(ICONS.trash as React.ReactElement, { className: 'w-4 h-4' })}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {selectedCustomerId && summary.find((s) => s.customer_id === selectedCustomerId) && (
                <div className="px-6 py-4 border-t border-border bg-muted/80 flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-muted-foreground">Current balance</span>
                  <span className={`font-mono font-black ${(summary.find((s) => s.customer_id === selectedCustomerId)?.balance ?? 0) > 0 ? 'text-amber-600' : 'text-foreground'}`}>
                    {CURRENCY} {(summary.find((s) => s.customer_id === selectedCustomerId)?.balance ?? 0).toLocaleString()}
                  </span>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      <Modal
        isOpen={receiveModalOpen}
        onClose={() => !receiveSubmitting && setReceiveModalOpen(false)}
        title="Receive Payment"
        size="md"
      >
        <form onSubmit={handleReceivePayment} className="space-y-5">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Customer</label>
            <select
              aria-label="Select customer"
              value={receiveCustomerId}
              onChange={(e) => setReceiveCustomerId(e.target.value)}
              className="w-full px-4 py-3 border border-border dark:border-slate-600 rounded-xl bg-background dark:bg-slate-800/90 text-foreground focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-500 outline-none transition-colors"
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.contact_no ? ` — ${c.contact_no}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Amount ({CURRENCY})</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={receiveAmount}
              onChange={(e) => setReceiveAmount(e.target.value)}
              className="w-full px-4 py-3 border border-border dark:border-slate-600 rounded-xl bg-background dark:bg-slate-800/90 text-foreground placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-500 outline-none transition-colors"
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Note (optional)</label>
            <input
              type="text"
              value={receiveNote}
              onChange={(e) => setReceiveNote(e.target.value)}
              className="w-full px-4 py-3 border border-border dark:border-slate-600 rounded-xl bg-background dark:bg-slate-800/90 text-foreground placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-500 outline-none transition-colors"
              placeholder="e.g. Cash received"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setReceiveModalOpen(false)}
              disabled={receiveSubmitting}
              className="flex-1 py-3 rounded-xl border-2 border-border dark:border-slate-600 text-muted-foreground font-bold hover:bg-muted/50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={receiveSubmitting || !receiveCustomerId || !receiveAmount || parseFloat(receiveAmount) <= 0}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 dark:hover:bg-emerald-500 shadow-sm dark:shadow-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {receiveSubmitting ? 'Saving…' : 'Save as credit'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!editingEntry}
        onClose={() => !editSubmitting && setEditingEntry(null)}
        title="Edit khata entry"
        size="md"
      >
        {editingEntry && (
          <form onSubmit={handleSaveEdit} className="space-y-5">
            {editingEntry.order_id && editingEntry.sale_number && (
              <p className="text-xs text-muted-foreground">
                Linked sale: <span className="font-mono font-semibold text-foreground">{editingEntry.sale_number}</span>
              </p>
            )}
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Type</label>
              <select
                aria-label="Entry type"
                value={editType}
                onChange={(e) => setEditType(e.target.value as 'debit' | 'credit')}
                className="w-full px-4 py-3 border border-border dark:border-slate-600 rounded-xl bg-background dark:bg-slate-800/90 text-foreground focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="debit">Debit (adds to balance)</option>
                <option value="credit">Credit (reduces balance)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Amount ({CURRENCY})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full px-4 py-3 border border-border dark:border-slate-600 rounded-xl bg-background dark:bg-slate-800/90 text-foreground focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Note</label>
              <input
                type="text"
                aria-label="Note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="w-full px-4 py-3 border border-border dark:border-slate-600 rounded-xl bg-background dark:bg-slate-800/90 text-foreground focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Optional"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                disabled={editSubmitting}
                className="flex-1 py-3 rounded-xl border-2 border-border text-muted-foreground font-bold hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSubmitting || !editAmount || parseFloat(editAmount) <= 0}
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {editSubmitting ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={!!entryPendingDelete}
        onClose={() => !deleteSubmitting && setEntryPendingDelete(null)}
        title="Delete entry?"
        size="sm"
      >
        {entryPendingDelete && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              This will remove the{' '}
              <span className="font-bold text-foreground">{entryPendingDelete.type === 'debit' ? 'Debit' : 'Credit'}</span> of{' '}
              <span className="font-mono font-bold text-foreground">
                {CURRENCY} {entryPendingDelete.amount.toLocaleString()}
              </span>{' '}
              from the ledger. Balances will update accordingly.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEntryPendingDelete(null)}
                disabled={deleteSubmitting}
                className="flex-1 py-3 rounded-xl border-2 border-border text-muted-foreground font-bold hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteSubmitting}
                className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteSubmitting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default KhataPage;
