import React, { useState, useEffect } from 'react';
import { procurementApi } from '../../../services/shopApi';
import Button from '../../ui/Button';
import Select from '../../ui/Select';

export type SupplierPaymentEditFormState = {
  supplierId: string;
  amount: number;
  paymentMethod: 'Cash' | 'Bank' | 'Card';
  bankAccountId: string;
  paymentDate: string;
  reference: string;
  notes: string;
};

function procurementErr(err: unknown, fallback: string): string {
  const e = err as { error?: string; message?: string; response?: { data?: { error?: string } } };
  return e?.error || e?.response?.data?.error || e?.message || fallback;
}

/** Scale existing bill splits to a new payment total (for edits without an allocation UI). */
function scaleAllocationsToAmount(
  baseline: { purchaseBillId: string; amount: number }[],
  newTotal: number
): { purchaseBillId: string; amount: number }[] {
  const positive = baseline.map((a) => ({
    purchaseBillId: a.purchaseBillId,
    amount: Math.max(0, Number(a.amount) || 0),
  }));
  const sum = positive.reduce((s, a) => s + a.amount, 0);
  if (positive.length === 0 || newTotal <= 0) return [];
  if (sum <= 0) return [];
  const factor = newTotal / sum;
  const scaled = positive.map((a) => ({
    purchaseBillId: a.purchaseBillId,
    amount: Math.round(a.amount * factor * 100) / 100,
  }));
  const scaledSum = scaled.reduce((s, a) => s + a.amount, 0);
  const drift = Math.round((newTotal - scaledSum) * 100) / 100;
  if (scaled.length > 0 && Math.abs(drift) >= 0.001) {
    const last = scaled[scaled.length - 1];
    scaled[scaled.length - 1] = {
      ...last,
      amount: Math.max(0, Math.round((last.amount + drift) * 100) / 100),
    };
  }
  return scaled.filter((a) => a.amount > 0);
}

export function SupplierPaymentEditDialog({
  paymentId,
  vendors,
  bankAccounts,
  onClose,
  onSaved,
}: {
  paymentId: string | null;
  vendors: any[];
  bankAccounts: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [form, setForm] = useState<SupplierPaymentEditFormState | null>(null);
  const [baselineAllocations, setBaselineAllocations] = useState<{ purchaseBillId: string; amount: number }[]>([]);

  useEffect(() => {
    if (!paymentId) {
      setForm(null);
      setBaselineAllocations([]);
      return;
    }
    let cancelled = false;
    setLoadingPayment(true);
    setForm(null);
    (async () => {
      try {
        const payment = await procurementApi.getSupplierPaymentById(paymentId);
        if (cancelled || !payment) return;
        const allocs = Array.isArray(payment.allocations)
          ? payment.allocations.map((x: any) => ({
              purchaseBillId: x.purchaseBillId || x.purchase_bill_id,
              amount: Number(x.amount) || 0,
            }))
          : [];
        setBaselineAllocations(allocs);
        setForm({
          supplierId: payment.supplier_id,
          amount: Number(payment.amount) || 0,
          paymentMethod: (payment.payment_method as SupplierPaymentEditFormState['paymentMethod']) || 'Cash',
          bankAccountId: payment.bank_account_id || '',
          paymentDate: (payment.payment_date || '').toString().slice(0, 10),
          reference: payment.reference || '',
          notes: payment.notes || '',
        });
      } catch (err: unknown) {
        if (!cancelled) {
          alert(procurementErr(err, 'Failed to load payment'));
          onClose();
        }
      } finally {
        if (!cancelled) setLoadingPayment(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-load when paymentId changes; onClose identity may vary per parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  if (!paymentId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 py-8"
      onClick={() => !updatingPayment && onClose()}
    >
      <div className="card my-auto w-full max-w-lg p-6 shadow-erp-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="section-title mb-4">Edit supplier payment</h3>
        {loadingPayment || !form ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="label mb-1 block">Supplier</label>
                <Select
                  value={form.supplierId}
                  onChange={(e) => setForm((f) => (f ? { ...f, supplierId: e.target.value } : f))}
                  required
                  disabled
                  title="Supplier is fixed for this payment"
                  className="cursor-not-allowed opacity-90"
                >
                  <option value="">Select supplier...</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">To pay a different supplier, record a new payment from Purchase Bills.</p>
              </div>
              <div>
                <label className="label mb-1 block">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, amount: parseFloat(e.target.value) || 0 } : f))}
                  className="input input-text w-full tabular-nums"
                />
              </div>
              <div>
                <label className="label mb-1 block">Payment method</label>
                <Select
                  value={form.paymentMethod}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, paymentMethod: e.target.value as SupplierPaymentEditFormState['paymentMethod'] } : f))
                  }
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
                    onChange={(e) => setForm((f) => (f ? { ...f, bankAccountId: e.target.value } : f))}
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
                  value={form.paymentDate}
                  onChange={(e) => setForm((f) => (f ? { ...f, paymentDate: e.target.value } : f))}
                  className="input input-text w-full"
                />
              </div>
              <div>
                <label className="label mb-1 block">Reference</label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) => setForm((f) => (f ? { ...f, reference: e.target.value } : f))}
                  className="input input-text w-full placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label className="label mb-1 block">Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))}
                  className="input input-text w-full placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={
                  updatingPayment ||
                  !form ||
                  form.amount <= 0 ||
                  baselineAllocations.length === 0 ||
                  (form.paymentMethod === 'Bank' && !form.bankAccountId)
                }
                onClick={async () => {
                  if (!form || !paymentId) return;
                  const allocations = scaleAllocationsToAmount(baselineAllocations, form.amount);
                  if (allocations.length === 0) {
                    alert('This payment is not linked to any bills; it cannot be edited here.');
                    return;
                  }
                  setUpdatingPayment(true);
                  try {
                    await procurementApi.updateSupplierPayment(paymentId, {
                      supplierId: form.supplierId,
                      amount: form.amount,
                      paymentMethod: form.paymentMethod,
                      bankAccountId: form.paymentMethod === 'Bank' && form.bankAccountId ? form.bankAccountId : undefined,
                      paymentDate: form.paymentDate,
                      reference: form.reference || undefined,
                      notes: form.notes || undefined,
                      allocations,
                    });
                    onSaved();
                    onClose();
                  } catch (err: unknown) {
                    alert(procurementErr(err, 'Failed to update payment'));
                  } finally {
                    setUpdatingPayment(false);
                  }
                }}
              >
                {updatingPayment ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" type="button" disabled={updatingPayment} onClick={() => !updatingPayment && onClose()}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function SupplierPaymentDeleteDialog({
  paymentId,
  onClose,
  onDeleted,
}: {
  paymentId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!paymentId) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !busy && onClose()}>
      <div className="card w-full max-w-sm p-6 shadow-erp-md" onClick={(e) => e.stopPropagation()}>
        <p className="mb-4 font-medium text-foreground">
          Delete this supplier payment? Linked purchase bills will be updated—balances and statuses (Posted / Partial / Paid)
          will reflect the reversal.
        </p>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            variant="danger"
            onClick={async () => {
              setBusy(true);
              try {
                await procurementApi.deleteSupplierPayment(paymentId);
                onDeleted();
                onClose();
              } catch (err: unknown) {
                alert(procurementErr(err, 'Failed to delete payment'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Deleting...' : 'Delete'}
          </Button>
          <Button variant="outline" type="button" disabled={busy} onClick={() => !busy && onClose()}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
