import React, { useState, useEffect } from 'react';
import { procurementApi, shopApi } from '../../../services/shopApi';
import Button from '../../ui/Button';
import Select from '../../ui/Select';

const CURRENCY = 'PKR';

export default function SupplierPaymentsSection() {
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

  useEffect(() => {
    Promise.all([shopApi.getVendors(), shopApi.getBankAccounts()]).then(([v, b]) => {
      setVendors(Array.isArray(v) ? v : []);
      setBankAccounts(Array.isArray(b) ? b : []);
    });
    procurementApi.getSupplierPayments().then((r) => setPayments(Array.isArray(r) ? r : []));
  }, []);

  useEffect(() => {
    if (!form.supplierId) {
      setBillsWithBalance([]);
      setForm((f) => ({ ...f, allocations: [] }));
      setAllocateInputs({});
      return;
    }
    procurementApi.getBillsWithBalance(form.supplierId).then((r) => {
      setBillsWithBalance(Array.isArray(r) ? r : []);
      setForm((f) => ({ ...f, allocations: [] }));
      setAllocateInputs({});
    });
  }, [form.supplierId]);

  const handleAllocate = (billId: string, amount: number) => {
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
      alert('Select supplier and enter amount.');
      return;
    }
    if (form.allocations.length === 0) {
      alert('Allocate at least one bill (enter amount next to a bill and click Allocate).');
      return;
    }
    if (Math.abs(totalAllocated - form.amount) > 0.01) {
      alert(`Total allocated (${totalAllocated}) must equal payment amount (${form.amount}).`);
      return;
    }
    setLoading(true);
    try {
      await procurementApi.recordSupplierPayment({
        supplierId: form.supplierId,
        amount: form.amount,
        paymentMethod: form.paymentMethod,
        bankAccountId: form.paymentMethod === 'Bank' && form.bankAccountId ? form.bankAccountId : undefined,
        paymentDate: form.paymentDate,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        allocations: form.allocations,
      });
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
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Record Supplier Payment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
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
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-xs font-bold text-amber-800 uppercase mb-2">Bills with balance — allocate payment to bills</p>
              {billsWithBalance.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-amber-100 last:border-0">
                  <span className="text-sm font-medium">{b.bill_number}</span>
                  <span className="text-slate-500 text-xs">Balance: {CURRENCY} {Number(b.balance_due).toLocaleString()}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount"
                    value={allocateInputs[b.id] ?? ''}
                    onChange={(e) => setAllocateInputs((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    className="w-24 border border-slate-200 rounded px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleAllocate(b.id, parseFloat(allocateInputs[b.id] || '0') || 0)}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    Allocate
                  </button>
                  {form.allocations.find((a) => a.purchaseBillId === b.id) && (
                    <span className="text-xs text-emerald-600">
                      Allocated: {CURRENCY} {form.allocations.find((a) => a.purchaseBillId === b.id)?.amount.toLocaleString()}
                      <button type="button" onClick={() => removeAllocation(b.id)} className="ml-1 text-rose-500">✕</button>
                    </span>
                  )}
                </div>
              ))}
              {form.allocations.length > 0 && (
                <p className="text-xs font-bold text-slate-600 mt-2">
                  Total allocated: {CURRENCY} {totalAllocated.toLocaleString()}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={form.amount || ''}
              onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment method</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Bank account</label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment date</label>
            <input
              type="date"
              value={form.paymentDate}
              onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reference (optional)</label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2"
              placeholder="Chq no, transfer ref..."
            />
          </div>
          <Button type="submit" disabled={loading} className="bg-indigo-600 text-white">
            {loading ? 'Saving...' : 'Record Payment'}
          </Button>
        </form>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Recent supplier payments</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="pb-2">Date</th>
                <th className="pb-2">Supplier</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2">Method</th>
              </tr>
            </thead>
            <tbody>
              {payments.slice(0, 20).map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2">{p.payment_date?.slice(0, 10)}</td>
                  <td className="py-2">{p.supplier_name}</td>
                  <td className="py-2 text-right font-medium">{CURRENCY} {Number(p.amount).toLocaleString()}</td>
                  <td className="py-2">{p.payment_method}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <p className="text-slate-400 py-6 text-center">No payments yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
