import React, { useState, useEffect, useRef } from 'react';
import { procurementApi, shopApi } from '../../../services/shopApi';
import { recordSupplierPaymentOfflineFirst, getProcurementCache, setProcurementCache } from '../../../services/procurementSyncService';
import { getTenantId } from '../../../services/posOfflineDb';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import type { PaymentPrefill } from '../ProcurementPage';

import { CURRENCY } from '../../../constants';
import { showProcurementToast } from './utils/showProcurementToast';

interface SupplierPaymentsSectionProps {
  initialPrefill?: PaymentPrefill | null;
  onClearPrefill?: () => void;
}

export default function SupplierPaymentsSection({ initialPrefill, onClearPrefill }: SupplierPaymentsSectionProps) {
  const [vendors, setVendors] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [billsWithBalance, setBillsWithBalance] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    supplierId: '',
    amount: 0,
    paymentMethod: 'Cash' as 'Cash' | 'Bank' | 'Card',
    bankAccountId: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
    allocations: [] as { purchaseBillId: string; amount: number }[],
  });
  const [allocateInputs, setAllocateInputs] = useState<Record<string, string>>({});
  const appliedPrefillRef = useRef(false);
  const [editPaymentId, setEditPaymentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<typeof form | null>(null);
  const [editBillsWithBalance, setEditBillsWithBalance] = useState<any[]>([]);
  const [editAllocateInputs, setEditAllocateInputs] = useState<Record<string, string>>({});
  const [deleteConfirmPaymentId, setDeleteConfirmPaymentId] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState(false);

  useEffect(() => {
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
      Promise.all([shopApi.getVendors(), shopApi.getBankAccounts()]).then(([v, b]) => {
        setVendors(Array.isArray(v) ? v : []);
        setBankAccounts(Array.isArray(b) ? b : []);
      });
      procurementApi.getSupplierPayments()
        .then((r) => {
          const list = Array.isArray(r) ? r : [];
          setPayments(list);
          if (tenantId) setProcurementCache(tenantId, { supplierPayments: list }).catch(() => {});
        })
        .catch(() => {
          if (tenantId) getProcurementCache(tenantId).then((c) => { if (c?.data?.supplierPayments?.length) setPayments(c.data.supplierPayments); });
        });
    } else if (tenantId) {
      getProcurementCache(tenantId).then((c) => {
        if (c?.data?.supplierPayments?.length) setPayments(c.data.supplierPayments);
      });
    }
  }, []);

  // Apply prefill when opened from "Pay remaining" on a purchase bill
  useEffect(() => {
    if (!initialPrefill || !onClearPrefill) return;
    setForm((f) => ({
      ...f,
      supplierId: initialPrefill.supplierId,
      amount: initialPrefill.amount,
      allocations: [...initialPrefill.allocations],
    }));
    appliedPrefillRef.current = true;
    onClearPrefill();
  }, [initialPrefill, onClearPrefill]);

  useEffect(() => {
    if (!form.supplierId) {
      setBillsWithBalance([]);
      setForm((f) => ({ ...f, allocations: [] }));
      setAllocateInputs({});
      return;
    }
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
      procurementApi.getBillsWithBalance(form.supplierId)
        .then((r) => {
          const list = Array.isArray(r) ? r : [];
          setBillsWithBalance(list);
          if (tenantId) setProcurementCache(tenantId, { supplierLedger: list }, `bills_${form.supplierId}`).catch(() => {});
          if (!appliedPrefillRef.current) {
            setForm((f) => ({ ...f, allocations: [] }));
            setAllocateInputs({});
          }
          appliedPrefillRef.current = false;
        });
    } else if (tenantId) {
      getProcurementCache(tenantId, `bills_${form.supplierId}`)
        .then((c) => {
          if (c?.data?.supplierLedger) setBillsWithBalance(Array.isArray(c.data.supplierLedger) ? c.data.supplierLedger : []);
          if (!appliedPrefillRef.current) {
            setForm((f) => ({ ...f, allocations: [] }));
            setAllocateInputs({});
          }
          appliedPrefillRef.current = false;
        });
    }
  }, [form.supplierId]);

  const handleAllocate = (billId: string, amountOrBlank?: number) => {
    const bill = billsWithBalance.find((b) => b.id === billId);
    const balanceDue = bill ? Number(bill.balance_due) || 0 : 0;
    const amount = amountOrBlank != null && amountOrBlank > 0 ? amountOrBlank : balanceDue;
    if (amount <= 0) return;
    setForm((f) => {
      const existing = f.allocations.find((a) => a.purchaseBillId === billId);
      const rest = f.allocations.filter((a) => a.purchaseBillId !== billId);
      const newAlloc = { purchaseBillId: billId, amount: existing ? existing.amount + amount : amount };
      return { ...f, allocations: [...rest, newAlloc] };
    });
    setAllocateInputs((prev) => ({ ...prev, [billId]: '' }));
  };

  const removeAllocation = (billId: string) => {
    setForm((f) => ({ ...f, allocations: f.allocations.filter((a) => a.purchaseBillId !== billId) }));
  };

  const totalAllocated = form.allocations.reduce((s, a) => s + a.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId || form.amount <= 0) {
      showProcurementToast('Select supplier and enter amount.', 'error');
      return;
    }
    if (form.allocations.length === 0) {
      showProcurementToast('Allocate at least one bill (enter amount next to a bill and click Allocate).', 'error');
      return;
    }
    if (Math.abs(totalAllocated - form.amount) > 0.01) {
      showProcurementToast(
        `Total allocated (${totalAllocated}) must equal payment amount (${form.amount}).`,
        'error'
      );
      return;
    }
    setLoading(true);
    try {
      const result = await recordSupplierPaymentOfflineFirst({
        supplierId: form.supplierId,
        amount: form.amount,
        paymentMethod: form.paymentMethod,
        bankAccountId: form.paymentMethod === 'Bank' && form.bankAccountId ? form.bankAccountId : undefined,
        paymentDate: form.paymentDate,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        allocations: form.allocations,
      });
      if (result.synced) {
        showProcurementToast('Payment recorded', 'success');
        setForm({
          supplierId: form.supplierId,
          amount: 0,
          paymentMethod: 'Cash',
          bankAccountId: '',
          paymentDate: new Date().toISOString().slice(0, 10),
          reference: '',
          notes: '',
          allocations: [],
        });
        const list = await procurementApi.getSupplierPayments();
        setPayments(Array.isArray(list) ? list : []);
        const bills = await procurementApi.getBillsWithBalance(form.supplierId);
        setBillsWithBalance(Array.isArray(bills) ? bills : []);
      } else if (result.localId) {
        showProcurementToast('Payment queued offline — will sync when online', 'success');
        setForm({
          supplierId: form.supplierId,
          amount: 0,
          paymentMethod: 'Cash',
          bankAccountId: '',
          paymentDate: new Date().toISOString().slice(0, 10),
          reference: '',
          notes: '',
          allocations: [],
        });
        console.warn('Payment saved offline. Will sync when back online.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to record payment';
      showProcurementToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="card p-6">
        <h2 className="section-title mb-4">Record supplier payment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label mb-1 block">Supplier</label>
            <Select
              value={form.supplierId}
              onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
              required
            >
              <option value="">Select supplier...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </div>
          {billsWithBalance.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-amber-500/10 p-4 dark:bg-amber-500/5">
              <p className="mb-2 text-xs font-bold uppercase text-warning">Bills with balance — allocate payment to bills</p>
              {billsWithBalance.map((b) => {
                const billId = b.id;
                const inputVal = allocateInputs[billId] ?? '';
                const alloc = form.allocations.find((a) => a.purchaseBillId === billId);
                return (
                  <div key={billId} className="flex flex-wrap items-center gap-2 py-2 border-b border-amber-100 last:border-0">
                    <span className="body-text font-medium">{b.bill_number}</span>
                    <span className="secondary-text text-muted-foreground dark:text-muted-foreground">
                      Balance: <span className="numeric-data">{CURRENCY} {Number(b.balance_due).toLocaleString()}</span>
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={Number(b.balance_due) || undefined}
                      placeholder="Amount"
                      value={inputVal}
                      onChange={(e) => setAllocateInputs((prev) => ({ ...prev, [billId]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAllocate(billId, parseFloat(inputVal) || 0);
                        }
                      }}
                      className="input input-text w-24 rounded-lg px-2 py-1.5 tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const num = parseFloat(inputVal);
                        handleAllocate(billId, Number.isNaN(num) || num <= 0 ? undefined : num);
                      }}
                      className="btn-primary cursor-pointer select-none px-3 py-1.5 text-xs"
                    >
                      Allocate
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAllocate(billId);
                      }}
                      className="px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      title="Allocate full balance"
                    >
                      Full balance
                    </button>
                    {alloc && (
                      <span className="text-xs text-emerald-600 flex items-center gap-1">
                        Allocated: {CURRENCY} {alloc.amount.toLocaleString()}
                        <button type="button" onClick={() => removeAllocation(billId)} className="ml-1 text-rose-500 hover:text-rose-700 cursor-pointer" aria-label="Remove allocation">✕</button>
                      </span>
                    )}
                  </div>
                );
              })}
              {form.allocations.length > 0 && (
                <p className="secondary-text mt-2 font-semibold text-muted-foreground dark:text-slate-300">
                  Total allocated:{' '}
                  <span className="numeric-data">
                    {CURRENCY} {totalAllocated.toLocaleString()}
                  </span>
                  {form.amount > 0 && (
                    <span className={totalAllocated > form.amount ? ' text-rose-600' : totalAllocated < form.amount ? ' text-amber-600' : ' text-emerald-600'}>
                      {totalAllocated > form.amount ? ' (over)' : totalAllocated < form.amount ? ' (remaining ' + (form.amount - totalAllocated).toLocaleString() + ')' : ' (ok)'}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="label mb-1 block">Payment amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={form.amount || ''}
              onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              className="input input-text tabular-nums"
            />
          </div>
          <div>
            <label className="label mb-1 block">Payment method</label>
            <Select
              value={form.paymentMethod}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as any }))}
            >
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
              <option value="Card">Card</option>
            </Select>
          </div>
          {form.paymentMethod === 'Bank' && (
            <div>
              <label className="label mb-1 block">Bank account</label>
              <Select
                value={form.bankAccountId}
                onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}
              >
                <option value="">Select...</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <label className="label mb-1 block">Payment date</label>
            <input
              type="date"
              value={form.paymentDate}
              onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
              className="input input-text"
            />
          </div>
          <div>
            <label className="label mb-1 block">Reference (optional)</label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              className="input input-text placeholder:text-muted-foreground"
              placeholder="Chq no, transfer ref..."
            />
          </div>
          <Button type="submit" disabled={loading} variant="primary">
            {loading ? 'Saving...' : 'Record Payment'}
          </Button>
        </form>
      </div>
      <div className="card p-6">
        <h2 className="section-title mb-4">Recent supplier payments</h2>
        <div className="overflow-x-auto">
          <table className="table-modern w-full">
            <thead>
              <tr>
                <th className="table-header py-3 px-4">Date</th>
                <th className="table-header py-3 px-4">Supplier</th>
                <th className="table-header py-3 px-4 text-right">Amount</th>
                <th className="table-header py-3 px-4">Method</th>
                <th className="table-header w-24 py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.slice(0, 20).map((p) => (
                <tr key={p.id}>
                  <td className="py-3 px-4 text-sm">{p.payment_date?.slice(0, 10)}</td>
                  <td className="py-3 px-4 text-sm">{p.supplier_name}</td>
                  <td className="numeric-data py-3 px-4 text-right">
                    {CURRENCY} {Number(p.amount).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm">{p.payment_method}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const payment = await procurementApi.getSupplierPaymentById(p.id);
                            if (!payment) return;
                            setEditForm({
                              supplierId: payment.supplier_id,
                              amount: Number(payment.amount) || 0,
                              paymentMethod: (payment.payment_method as any) || 'Cash',
                              bankAccountId: payment.bank_account_id || '',
                              paymentDate: (payment.payment_date || '').toString().slice(0, 10),
                              reference: payment.reference || '',
                              notes: payment.notes || '',
                              allocations: Array.isArray(payment.allocations) ? payment.allocations : [],
                            });
                            setEditPaymentId(p.id);
                            setEditAllocateInputs({});
                            const bills = await procurementApi.getBillsWithBalance(payment.supplier_id);
                            setEditBillsWithBalance(Array.isArray(bills) ? bills : []);
                          } catch (err: any) {
                            alert(err?.response?.data?.error || err?.message || 'Failed to load payment');
                          }
                        }}
                        className="rounded px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmPaymentId(p.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">No payments yet</p>
          )}
        </div>
      </div>

      {editPaymentId && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8" onClick={() => !updatingPayment && setEditPaymentId(null)}>
          <div className="card my-auto w-full max-w-lg p-6 shadow-erp-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title mb-4">Edit supplier payment</h3>
            <div className="space-y-3">
              <div>
                <label className="label mb-1 block">Supplier</label>
                <Select value={editForm.supplierId} onChange={(e) => setEditForm((f) => f ? { ...f, supplierId: e.target.value } : f)} required>
                  <option value="">Select supplier...</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </Select>
              </div>
              {editBillsWithBalance.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-bold text-amber-800 uppercase mb-2">Allocate to bills</p>
                  {editBillsWithBalance.map((b) => {
                    const billId = b.id;
                    const inputVal = editAllocateInputs[billId] ?? '';
                    const alloc = editForm.allocations.find((a) => a.purchaseBillId === billId);
                    return (
                      <div key={billId} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-amber-100 last:border-0">
                        <span className="text-sm">{b.bill_number}</span>
                        <span className="text-xs text-muted-foreground">Balance: {CURRENCY} {Number(b.balance_due).toLocaleString()}</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={inputVal}
                          onChange={(e) => setEditAllocateInputs((prev) => ({ ...prev, [billId]: e.target.value }))}
                          className="input input-text w-20 rounded px-2 py-1 tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const num = parseFloat(inputVal);
                            const amt = Number.isNaN(num) || num <= 0 ? Number(b.balance_due) || 0 : num;
                            if (amt <= 0) return;
                            setEditForm((f) => {
                              if (!f) return f;
                              const rest = f.allocations.filter((a) => a.purchaseBillId !== billId);
                              const existing = f.allocations.find((a) => a.purchaseBillId === billId);
                              return { ...f, allocations: [...rest, { purchaseBillId: billId, amount: existing ? existing.amount + amt : amt }] };
                            });
                            setEditAllocateInputs((prev) => ({ ...prev, [billId]: '' }));
                          }}
                          className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded"
                        >
                          Allocate
                        </button>
                        {alloc && (
                          <span className="text-xs text-emerald-600">
                            {CURRENCY} {alloc.amount.toLocaleString()}
                            <button type="button" onClick={() => setEditForm((f) => f ? { ...f, allocations: f.allocations.filter((a) => a.purchaseBillId !== billId) } : f)} className="ml-1 text-rose-500">✕</button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-xs mt-1">Total allocated: {CURRENCY} {editForm.allocations.reduce((s, a) => s + a.amount, 0).toLocaleString()}</p>
                </div>
              )}
              <div>
                <label className="label mb-1 block">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.amount || ''}
                  onChange={(e) => setEditForm((f) => f ? { ...f, amount: parseFloat(e.target.value) || 0 } : f)}
                  className="input input-text w-full tabular-nums"
                />
              </div>
              <div>
                <label className="label mb-1 block">Payment method</label>
                <Select value={editForm.paymentMethod} onChange={(e) => setEditForm((f) => f ? { ...f, paymentMethod: e.target.value as any } : f)}>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Card">Card</option>
                </Select>
              </div>
              {editForm.paymentMethod === 'Bank' && (
                <div>
                  <label className="label mb-1 block">Bank account</label>
                  <Select value={editForm.bankAccountId} onChange={(e) => setEditForm((f) => f ? { ...f, bankAccountId: e.target.value } : f)}>
                    <option value="">Select...</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                </div>
              )}
              <div>
                <label className="label mb-1 block">Payment date</label>
                <input
                  type="date"
                  value={editForm.paymentDate}
                  onChange={(e) => setEditForm((f) => f ? { ...f, paymentDate: e.target.value } : f)}
                  className="input input-text w-full"
                />
              </div>
              <div>
                <label className="label mb-1 block">Reference</label>
                <input
                  type="text"
                  value={editForm.reference}
                  onChange={(e) => setEditForm((f) => f ? { ...f, reference: e.target.value } : f)}
                  className="input input-text w-full placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label className="label mb-1 block">Notes</label>
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => f ? { ...f, notes: e.target.value } : f)}
                  className="input input-text w-full placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                disabled={updatingPayment || editForm.allocations.length === 0 || Math.abs(editForm.allocations.reduce((s, a) => s + a.amount, 0) - editForm.amount) > 0.01}
                onClick={async () => {
                  if (!editForm) return;
                  setUpdatingPayment(true);
                  try {
                    await procurementApi.updateSupplierPayment(editPaymentId, {
                      supplierId: editForm.supplierId,
                      amount: editForm.amount,
                      paymentMethod: editForm.paymentMethod,
                      bankAccountId: editForm.paymentMethod === 'Bank' && editForm.bankAccountId ? editForm.bankAccountId : undefined,
                      paymentDate: editForm.paymentDate,
                      reference: editForm.reference || undefined,
                      notes: editForm.notes || undefined,
                      allocations: editForm.allocations,
                    });
                    setEditPaymentId(null);
                    setEditForm(null);
                    const list = await procurementApi.getSupplierPayments();
                    setPayments(Array.isArray(list) ? list : []);
                  } catch (err: any) {
                    alert(err?.response?.data?.error || err?.message || 'Failed to update payment');
                  } finally {
                    setUpdatingPayment(false);
                  }
                }}
                className="bg-indigo-600 text-white"
              >
                {updatingPayment ? 'Saving...' : 'Save'}
              </Button>
              <Button onClick={() => !updatingPayment && (setEditPaymentId(null), setEditForm(null))} className="bg-slate-200 text-foreground">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmPaymentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !updatingPayment && setDeleteConfirmPaymentId(null)}>
          <div className="card w-full max-w-sm p-6 shadow-erp-md" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 font-medium text-foreground">
              Delete this supplier payment? Accounting will be reversed and linked bills will show the unpaid balance again.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={updatingPayment}
                onClick={async () => {
                  setUpdatingPayment(true);
                  try {
                    await procurementApi.deleteSupplierPayment(deleteConfirmPaymentId);
                    setDeleteConfirmPaymentId(null);
                    const list = await procurementApi.getSupplierPayments();
                    setPayments(Array.isArray(list) ? list : []);
                  } catch (err: any) {
                    alert(err?.response?.data?.error || err?.message || 'Failed to delete payment');
                  } finally {
                    setUpdatingPayment(false);
                  }
                }}
                className="bg-rose-600 text-white"
              >
                {updatingPayment ? 'Deleting...' : 'Delete'}
              </Button>
              <Button onClick={() => !updatingPayment && setDeleteConfirmPaymentId(null)} className="bg-slate-200 text-foreground">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
