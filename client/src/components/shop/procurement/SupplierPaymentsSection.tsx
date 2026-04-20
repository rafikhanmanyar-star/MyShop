import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Hash,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  ChevronRight,
  SquarePen,
} from 'lucide-react';
import { procurementApi, shopApi } from '../../../services/shopApi';
import { recordSupplierPaymentOfflineFirst, getProcurementCache, setProcurementCache } from '../../../services/procurementSyncService';
import { getTenantId } from '../../../services/posOfflineDb';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import type { PaymentPrefill } from '../ProcurementPage';

import { CURRENCY } from '../../../constants';
import { showProcurementToast } from './utils/showProcurementToast';

const DRAFT_STORAGE_KEY = 'procurement-supplier-payment-draft';

function formatMoney(n: number) {
  return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBillDate(iso: string | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300',
];

function avatarColorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function methodBadgeClass(method: string) {
  const m = (method || '').toLowerCase();
  if (m.includes('bank')) return 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200';
  if (m.includes('card')) return 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200';
  if (m.includes('cash')) return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-200';
}

function setAllocationForBill(
  allocations: { purchaseBillId: string; amount: number }[],
  billId: string,
  amount: number
) {
  const rest = allocations.filter((a) => a.purchaseBillId !== billId);
  if (amount <= 0.001) return rest;
  return [...rest, { purchaseBillId: billId, amount: Math.round(amount * 100) / 100 }];
}

function paymentInTabRange(paymentDate: string | undefined, tab: 'today' | 'week' | 'month') {
  if (!paymentDate) return false;
  const d = new Date(paymentDate);
  if (Number.isNaN(d.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (tab === 'today') return d >= start;
  if (tab === 'week') {
    const w = new Date(start);
    w.setDate(w.getDate() - 7);
    return d >= w;
  }
  const mo = new Date(start);
  mo.setMonth(mo.getMonth() - 1);
  return d >= mo;
}

interface SupplierPaymentsSectionProps {
  initialPrefill?: PaymentPrefill | null;
  onClearPrefill?: () => void;
  onViewReports?: () => void;
  onNewBill?: () => void;
}

export default function SupplierPaymentsSection({
  initialPrefill,
  onClearPrefill,
  onViewReports,
  onNewBill,
}: SupplierPaymentsSectionProps) {
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
  const appliedPrefillRef = useRef(false);
  const [editPaymentId, setEditPaymentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<typeof form | null>(null);
  const [editBillsWithBalance, setEditBillsWithBalance] = useState<any[]>([]);
  const [editAllocateInputs, setEditAllocateInputs] = useState<Record<string, string>>({});
  const [deleteConfirmPaymentId, setDeleteConfirmPaymentId] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [recentTab, setRecentTab] = useState<'today' | 'week' | 'month'>('today');
  const [amountUnlocked, setAmountUnlocked] = useState(false);

  const totalAllocated = form.allocations.reduce((s, a) => s + a.amount, 0);
  const outstandingBalance = useMemo(
    () => billsWithBalance.reduce((s, b) => s + (Number(b.balance_due) || 0), 0),
    [billsWithBalance]
  );
  const selectedBillCount = useMemo(
    () => form.allocations.filter((a) => a.amount > 0.001).length,
    [form.allocations]
  );

  useEffect(() => {
    if (!amountUnlocked) {
      setForm((f) => ({ ...f, amount: totalAllocated }));
    }
  }, [totalAllocated, amountUnlocked]);

  useEffect(() => {
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
      Promise.all([shopApi.getVendors(), shopApi.getBankAccounts()]).then(([v, b]) => {
        setVendors(Array.isArray(v) ? v : []);
        setBankAccounts(Array.isArray(b) ? b : []);
      });
      procurementApi
        .getSupplierPayments()
        .then((r) => {
          const list = Array.isArray(r) ? r : [];
          setPayments(list);
          if (tenantId) setProcurementCache(tenantId, { supplierPayments: list }).catch(() => {});
        })
        .catch(() => {
          if (tenantId)
            getProcurementCache(tenantId).then((c) => {
              if (c?.data?.supplierPayments?.length) setPayments(c.data.supplierPayments);
            });
        });
    } else if (tenantId) {
      getProcurementCache(tenantId).then((c) => {
        if (c?.data?.supplierPayments?.length) setPayments(c.data.supplierPayments);
      });
    }
  }, []);

  useEffect(() => {
    if (!initialPrefill || !onClearPrefill) return;
    setForm((f) => ({
      ...f,
      supplierId: initialPrefill.supplierId,
      amount: initialPrefill.amount,
      allocations: [...initialPrefill.allocations],
    }));
    setAmountUnlocked(false);
    appliedPrefillRef.current = true;
    onClearPrefill();
  }, [initialPrefill, onClearPrefill]);

  useEffect(() => {
    if (!form.supplierId) {
      setBillsWithBalance([]);
      setForm((f) => ({ ...f, allocations: [] }));
      return;
    }
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
      procurementApi.getBillsWithBalance(form.supplierId).then((r) => {
        const list = Array.isArray(r) ? r : [];
        setBillsWithBalance(list);
        if (tenantId) setProcurementCache(tenantId, { supplierLedger: list }, `bills_${form.supplierId}`).catch(() => {});
        if (!appliedPrefillRef.current) {
          setForm((f) => ({ ...f, allocations: [] }));
        }
        appliedPrefillRef.current = false;
      });
    } else if (tenantId) {
      getProcurementCache(tenantId, `bills_${form.supplierId}`).then((c) => {
        if (c?.data?.supplierLedger) setBillsWithBalance(Array.isArray(c.data.supplierLedger) ? c.data.supplierLedger : []);
        if (!appliedPrefillRef.current) {
          setForm((f) => ({ ...f, allocations: [] }));
        }
        appliedPrefillRef.current = false;
      });
    }
  }, [form.supplierId]);

  const filteredRecentPayments = useMemo(() => {
    return payments
      .filter((p) => paymentInTabRange(p.payment_date, recentTab))
      .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)));
  }, [payments, recentTab]);

  const selectAllBills = () => {
    const allocs = billsWithBalance.map((b) => ({
      purchaseBillId: b.id,
      amount: Math.round((Number(b.balance_due) || 0) * 100) / 100,
    }));
    setForm((f) => ({ ...f, allocations: allocs }));
    setAmountUnlocked(false);
  };

  const clearAllAllocations = () => {
    setForm((f) => ({ ...f, allocations: [] }));
    setAmountUnlocked(false);
  };

  const toggleBillRow = (billId: string, balanceDue: number) => {
    const existing = form.allocations.find((a) => a.purchaseBillId === billId);
    const isOn = existing && existing.amount > 0.001;
    if (isOn) {
      setForm((f) => ({ ...f, allocations: f.allocations.filter((a) => a.purchaseBillId !== billId) }));
    } else {
      const amt = Math.round(balanceDue * 100) / 100;
      setForm((f) => ({ ...f, allocations: setAllocationForBill(f.allocations, billId, amt) }));
    }
    setAmountUnlocked(false);
  };

  const updateBillAllocation = (billId: string, raw: string, balanceDue: number) => {
    const num = parseFloat(raw.replace(/,/g, ''));
    const clamped = Math.min(Math.max(0, Number.isNaN(num) ? 0 : num), balanceDue);
    setForm((f) => ({ ...f, allocations: setAllocationForBill(f.allocations, billId, clamped) }));
    setAmountUnlocked(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId || form.amount <= 0) {
      showProcurementToast('Select supplier and enter amount.', 'error');
      return;
    }
    if (form.allocations.length === 0) {
      showProcurementToast('Allocate at least one bill.', 'error');
      return;
    }
    if (Math.abs(totalAllocated - form.amount) > 0.01) {
      showProcurementToast(
        `Total allocated (${formatMoney(totalAllocated)}) must equal payment amount (${formatMoney(form.amount)}).`,
        'error'
      );
      return;
    }
    if (form.paymentMethod === 'Bank' && !form.bankAccountId) {
      showProcurementToast('Select a bank account for bank transfer payments.', 'error');
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
        setAmountUnlocked(false);
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
        setAmountUnlocked(false);
        console.warn('Payment saved offline. Will sync when back online.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to record payment';
      showProcurementToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = () => {
    const tenantId = getTenantId();
    if (!tenantId) {
      showProcurementToast('Cannot save draft offline.', 'error');
      return;
    }
    try {
      localStorage.setItem(
        `${DRAFT_STORAGE_KEY}:${tenantId}`,
        JSON.stringify({
          form,
          amountUnlocked,
          savedAt: new Date().toISOString(),
        })
      );
      showProcurementToast('Draft saved on this device', 'success');
    } catch {
      showProcurementToast('Could not save draft', 'error');
    }
  };

  const cancelForm = () => {
    setForm({
      supplierId: '',
      amount: 0,
      paymentMethod: 'Cash',
      bankAccountId: '',
      paymentDate: new Date().toISOString().slice(0, 10),
      reference: '',
      notes: '',
      allocations: [],
    });
    setAmountUnlocked(false);
    setBillsWithBalance([]);
  };

  const sectionShell = 'rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6';

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Supplier Payments</h2>
            <p className="secondary-text mt-1 text-muted-foreground">Record and manage payments to suppliers</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onViewReports?.()}
              className="button-text inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-accent active:scale-[0.99]"
            >
              <FileText className="h-4 w-4 opacity-80" />
              View Reports
            </button>
            <button
              type="button"
              onClick={() => onNewBill?.()}
              className="button-text inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95 active:scale-[0.99]"
            >
              <Plus className="h-4 w-4" />
              New Bill
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 1. Select supplier */}
          <div className={sectionShell}>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">1. Select supplier</p>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
              <div className="relative min-w-0 flex-1">
                <div className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                </div>
                <Select
                  value={form.supplierId}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, supplierId: e.target.value }));
                    setAmountUnlocked(false);
                  }}
                  required
                  className="rounded-xl border-border bg-muted/40 py-3 pl-10 pr-10 text-sm font-medium"
                >
                  <option value="">Select supplier...</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex shrink-0 flex-col justify-center rounded-xl border border-rose-200/80 bg-rose-50/90 px-5 py-4 dark:border-rose-900/50 dark:bg-rose-950/30">
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Outstanding balance</p>
                <p className="numeric-data mt-1 text-xl font-bold tabular-nums text-rose-700 dark:text-rose-300">
                  {CURRENCY} {formatMoney(outstandingBalance)}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Allocate */}
          {billsWithBalance.length > 0 && (
            <div className={sectionShell}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">2. Allocate payments</p>
                <div className="flex items-center gap-3 text-sm">
                  <button type="button" onClick={selectAllBills} className="font-semibold text-primary hover:underline">
                    Select all
                  </button>
                  <button type="button" onClick={clearAllAllocations} className="font-medium text-muted-foreground hover:text-foreground">
                    Clear all
                  </button>
                </div>
              </div>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 border-b border-border py-3 pl-1 pr-2" />
                      <th className="border-b border-border py-3 pr-4">Bill ID</th>
                      <th className="border-b border-border py-3 pr-4">Date</th>
                      <th className="border-b border-border py-3 pr-4 text-right">Total ({CURRENCY})</th>
                      <th className="border-b border-border py-3 pr-4 text-right">Remaining ({CURRENCY})</th>
                      <th className="border-b border-border py-3 pr-4">Allocate</th>
                      <th className="border-b border-border py-3 pr-1 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billsWithBalance.map((b) => {
                      const billId = b.id;
                      const balanceDue = Number(b.balance_due) || 0;
                      const alloc = form.allocations.find((a) => a.purchaseBillId === billId);
                      const allocAmt = alloc?.amount ?? 0;
                      const checked = allocAmt > 0.001;
                      const isFull = balanceDue > 0 && Math.abs(allocAmt - balanceDue) < 0.02;
                      return (
                        <tr key={billId} className="text-foreground">
                          <td className="border-b border-border/80 py-3 pl-1 pr-2 align-middle">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBillRow(billId, balanceDue)}
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                          </td>
                          <td className="border-b border-border/80 py-3 pr-4 align-middle font-medium">{b.bill_number}</td>
                          <td className="border-b border-border/80 py-3 pr-4 align-middle text-muted-foreground">{formatBillDate(b.bill_date)}</td>
                          <td className="numeric-data border-b border-border/80 py-3 pr-4 text-right align-middle tabular-nums">
                            {formatMoney(Number(b.total_amount) || 0)}
                          </td>
                          <td className="numeric-data border-b border-border/80 py-3 pr-4 text-right align-middle tabular-nums text-rose-600 dark:text-rose-400">
                            {formatMoney(balanceDue)}
                          </td>
                          <td className="border-b border-border/80 py-3 pr-4 align-middle">
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              max={balanceDue}
                              disabled={!checked}
                              value={checked ? allocAmt : 0}
                              onChange={(e) => updateBillAllocation(billId, e.target.value, balanceDue)}
                              className="input input-text w-full max-w-[7.5rem] rounded-lg px-2 py-2 tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </td>
                          <td className="border-b border-border/80 py-3 pr-1 text-center align-middle">
                            <span
                              className={`inline-block rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                                isFull ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              Full
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Items selected:{' '}
                  <span className="font-semibold text-foreground">
                    {selectedBillCount} of {billsWithBalance.length}
                  </span>
                </p>
                <p className="text-base font-semibold text-primary sm:text-lg">
                  Total allocation{' '}
                  <span className="numeric-data tabular-nums">
                    {CURRENCY} {formatMoney(totalAllocated)}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* 3. Payment info */}
          <div className={sectionShell}>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">3. Payment information</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payment method</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <Select
                    value={form.paymentMethod}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as 'Cash' | 'Bank' | 'Card' }))}
                    className="rounded-xl py-3 pl-10"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank">Bank transfer</option>
                    <option value="Card">Card</option>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reference number</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground">
                    <Hash className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="e.g. TXN-99028"
                    className="input input-text w-full rounded-xl py-3 pl-10 placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payment date</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                  </span>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
                    className="input input-text w-full rounded-xl py-3 pl-10"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amount to record</label>
                <div className="flex gap-2">
                  <div
                    className={`relative min-w-0 flex-1 rounded-xl border-2 transition-colors ${
                      amountUnlocked ? 'border-border' : 'border-primary/50 bg-primary/[0.04]'
                    }`}
                  >
                    <input
                      type={amountUnlocked ? 'number' : 'text'}
                      readOnly={!amountUnlocked}
                      step="0.01"
                      min={0}
                      value={amountUnlocked ? form.amount || '' : `${CURRENCY} ${formatMoney(form.amount)}`}
                      onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                      className={`input input-text w-full border-0 bg-transparent py-3 pl-3 pr-3 text-base font-bold tabular-nums focus:ring-0 ${
                        !amountUnlocked ? 'cursor-default text-primary' : ''
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (amountUnlocked) {
                        setAmountUnlocked(false);
                        setForm((f) => ({ ...f, amount: totalAllocated }));
                      } else {
                        setAmountUnlocked(true);
                      }
                    }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={amountUnlocked ? 'Match total allocation' : 'Edit amount'}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            {form.paymentMethod === 'Bank' && (
              <div className="mt-4">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bank account</label>
                <Select
                  value={form.bankAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}
                  className="rounded-xl py-3"
                >
                  <option value="">Select account...</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 border-t border-border/80 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={loading} variant="primary" className="rounded-xl px-8 py-3 text-base font-semibold">
                {loading ? 'Saving...' : 'Record payment'}
              </Button>
              <button
                type="button"
                onClick={saveDraft}
                className="button-text rounded-xl border border-border bg-muted/50 px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Save as draft
              </button>
            </div>
            <button type="button" onClick={cancelForm} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Recent payments sidebar */}
      <aside className="w-full shrink-0 space-y-4 lg:w-[340px]">
        <div className={sectionShell}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-foreground">Recent payments</h3>
            <button
              type="button"
              onClick={() => onViewReports?.()}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Reports & filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-4 flex rounded-xl border border-border bg-muted/30 p-0.5">
            {(['today', 'week', 'month'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRecentTab(tab)}
                className={`button-text flex-1 rounded-lg px-2 py-2 text-center text-xs font-semibold capitalize transition-all sm:text-sm ${
                  recentTab === tab ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'today' ? 'Today' : tab === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <ul className="max-h-[480px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
            {filteredRecentPayments.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">No payments in this period</li>
            )}
            {filteredRecentPayments.map((p) => (
              <li
                key={p.id}
                className="flex gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/35"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColorForId(
                    p.id || p.supplier_id || ''
                  )}`}
                >
                  {getInitials(p.supplier_name || '?')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-foreground">{p.supplier_name}</p>
                    <p className="numeric-data shrink-0 text-sm font-bold tabular-nums text-foreground">
                      {CURRENCY} {formatMoney(Number(p.amount))}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmPaymentId(p.id)}
                        className="rounded-md p-1.5 text-primary transition-colors hover:bg-primary/10"
                        aria-label="Delete payment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
                        className="rounded-md p-1.5 text-primary transition-colors hover:bg-primary/10"
                        aria-label="Edit payment"
                      >
                        <SquarePen className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <span>{formatBillDate(p.payment_date)}</span>
                      <span className="mx-1">•</span>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${methodBadgeClass(p.payment_method)}`}>
                        {p.payment_method}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onViewReports?.()}
            className="button-text mt-4 flex w-full items-center justify-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            View transaction history
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {editPaymentId && editForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 py-8"
          onClick={() => !updatingPayment && setEditPaymentId(null)}
        >
          <div className="card my-auto w-full max-w-lg p-6 shadow-erp-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title mb-4">Edit supplier payment</h3>
            <div className="space-y-3">
              <div>
                <label className="label mb-1 block">Supplier</label>
                <Select
                  value={editForm.supplierId}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, supplierId: e.target.value } : f))}
                  required
                >
                  <option value="">Select supplier...</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </div>
              {editBillsWithBalance.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="mb-2 text-xs font-bold uppercase text-amber-800 dark:text-amber-200">Allocate to bills</p>
                  {editBillsWithBalance.map((b) => {
                    const billId = b.id;
                    const inputVal = editAllocateInputs[billId] ?? '';
                    const alloc = editForm.allocations.find((a) => a.purchaseBillId === billId);
                    return (
                      <div key={billId} className="flex flex-wrap items-center gap-2 border-b border-amber-100 py-1.5 last:border-0 dark:border-amber-900/30">
                        <span className="text-sm">{b.bill_number}</span>
                        <span className="text-xs text-muted-foreground">
                          Balance: {CURRENCY} {Number(b.balance_due).toLocaleString()}
                        </span>
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
                              return {
                                ...f,
                                allocations: [...rest, { purchaseBillId: billId, amount: existing ? existing.amount + amt : amt }],
                              };
                            });
                            setEditAllocateInputs((prev) => ({ ...prev, [billId]: '' }));
                          }}
                          className="rounded px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                        >
                          Allocate
                        </button>
                        {alloc && (
                          <span className="text-xs text-emerald-600">
                            {CURRENCY} {alloc.amount.toLocaleString()}
                            <button
                              type="button"
                              onClick={() =>
                                setEditForm((f) =>
                                  f ? { ...f, allocations: f.allocations.filter((a) => a.purchaseBillId !== billId) } : f
                                )
                              }
                              className="ml-1 text-rose-500"
                            >
                              ✕
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <p className="mt-1 text-xs">
                    Total allocated: {CURRENCY} {editForm.allocations.reduce((s, a) => s + a.amount, 0).toLocaleString()}
                  </p>
                </div>
              )}
              <div>
                <label className="label mb-1 block">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.amount || ''}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, amount: parseFloat(e.target.value) || 0 } : f))}
                  className="input input-text w-full tabular-nums"
                />
              </div>
              <div>
                <label className="label mb-1 block">Payment method</label>
                <Select
                  value={editForm.paymentMethod}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, paymentMethod: e.target.value as any } : f))}
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Card">Card</option>
                </Select>
              </div>
              {editForm.paymentMethod === 'Bank' && (
                <div>
                  <label className="label mb-1 block">Bank account</label>
                  <Select
                    value={editForm.bankAccountId}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, bankAccountId: e.target.value } : f))}
                  >
                    <option value="">Select...</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div>
                <label className="label mb-1 block">Payment date</label>
                <input
                  type="date"
                  value={editForm.paymentDate}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, paymentDate: e.target.value } : f))}
                  className="input input-text w-full"
                />
              </div>
              <div>
                <label className="label mb-1 block">Reference</label>
                <input
                  type="text"
                  value={editForm.reference}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, reference: e.target.value } : f))}
                  className="input input-text w-full placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label className="label mb-1 block">Notes</label>
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, notes: e.target.value } : f))}
                  className="input input-text w-full placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                disabled={
                  updatingPayment ||
                  editForm.allocations.length === 0 ||
                  Math.abs(editForm.allocations.reduce((s, a) => s + a.amount, 0) - editForm.amount) > 0.01
                }
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
              <Button
                onClick={() => !updatingPayment && (setEditPaymentId(null), setEditForm(null))}
                className="bg-slate-200 text-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmPaymentId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !updatingPayment && setDeleteConfirmPaymentId(null)}
        >
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
