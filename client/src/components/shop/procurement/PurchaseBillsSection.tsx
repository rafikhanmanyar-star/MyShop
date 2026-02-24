import React, { useState, useEffect, useRef } from 'react';
import { procurementApi, shopApi } from '../../../services/shopApi';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import { CURRENCY } from '../../../constants';

export default function PurchaseBillsSection() {
  const [bills, setBills] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    supplierId: '',
    billNumber: `PB-${Date.now()}`,
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    items: [] as { productId: string; quantity: number; unitCost: number; taxAmount: number; subtotal: number }[],
    paymentStatus: 'Credit' as 'Credit' | 'Paid' | 'Partial',
    paidAmount: 0,
    bankAccountId: '',
    notes: '',
  });
  const [productSearch, setProductSearch] = useState('');
  const productSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      procurementApi.getPurchaseBills(),
      shopApi.getVendors(),
      shopApi.getProducts(),
      shopApi.getWarehouses(),
      shopApi.getBankAccounts(),
    ]).then(([b, v, p, w, ba]) => {
      setBills(Array.isArray(b) ? b : []);
      setVendors(Array.isArray(v) ? v : []);
      setProducts(Array.isArray(p) ? p : []);
      setWarehouses(Array.isArray(w) ? w : []);
      setBankAccounts(Array.isArray(ba) ? ba : []);
    });
  }, []);

  const subtotal = form.items.reduce((s, i) => s + i.subtotal, 0);
  const taxTotal = form.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
  const totalAmount = subtotal + taxTotal;

  const addItem = (p: any) => {
    const existing = form.items.find((i) => i.productId === p.id);
    if (existing) {
      setForm((f) => ({
        ...f,
        items: f.items.map((i) =>
          i.productId === p.id
            ? {
                ...i,
                quantity: i.quantity + 1,
                subtotal: (i.quantity + 1) * i.unitCost,
              }
            : i
        ),
      }));
    } else {
      setForm((f) => ({
        ...f,
        items: [
          ...f.items,
          {
            productId: p.id,
            quantity: 1,
            unitCost: Number(p.cost_price) || 0,
            taxAmount: 0,
            subtotal: Number(p.cost_price) || 0,
          },
        ],
      }));
    }
    setProductSearch('');
  };

  const updateItem = (productId: string, field: string, value: number) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((i) => {
        if (i.productId !== productId) return i;
        const next = { ...i, [field]: value };
        if (field === 'quantity' || field === 'unitCost') {
          next.subtotal = next.quantity * next.unitCost;
        }
        return next;
      }),
    }));
  };

  const removeItem = (productId: string) => {
    setForm((f) => ({ ...f, items: f.items.filter((i) => i.productId !== productId) }));
  };

  const filteredProducts = products.filter(
    (p) =>
      !productSearch ||
      p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId || form.items.length === 0) {
      alert('Select supplier and add at least one item.');
      return;
    }
    setLoading(true);
    try {
      await procurementApi.createPurchaseBill({
        supplierId: form.supplierId,
        billNumber: form.billNumber,
        billDate: form.billDate,
        dueDate: form.dueDate || undefined,
        items: form.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitCost: i.unitCost,
          taxAmount: i.taxAmount || 0,
          subtotal: i.subtotal,
        })),
        subtotal,
        taxTotal,
        totalAmount,
        paymentStatus: form.paymentStatus,
        paidAmount: form.paymentStatus !== 'Credit' ? form.paidAmount || totalAmount : 0,
        bankAccountId: form.bankAccountId || undefined,
        notes: form.notes || undefined,
      });
      setForm({
        supplierId: '',
        billNumber: `PB-${Date.now()}`,
        billDate: new Date().toISOString().slice(0, 10),
        dueDate: '',
        items: [],
        paymentStatus: 'Credit',
        paidAmount: 0,
        bankAccountId: '',
        notes: '',
      });
      setShowForm(false);
      const list = await procurementApi.getPurchaseBills();
      setBills(Array.isArray(list) ? list : []);
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.message || 'Failed to create purchase bill');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-800">Purchase bills</h2>
        <Button
          onClick={() => setShowForm(!showForm)}
          className={showForm ? 'bg-slate-200 text-slate-700' : 'bg-indigo-600 text-white'}
        >
          {showForm ? 'Cancel' : 'New purchase bill'}
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-bold text-slate-800 mb-4">Create purchase bill</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
                <Select
                  value={form.supplierId}
                  onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                  required
                >
                  <option value="">Select...</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bill number</label>
                <input
                  type="text"
                  value={form.billNumber}
                  onChange={(e) => setForm((f) => ({ ...f, billNumber: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bill date *</label>
                <input
                  type="date"
                  value={form.billDate}
                  onChange={(e) => setForm((f) => ({ ...f, billDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Due date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
            </div>

            <div ref={productSearchRef} className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Add product</label>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search by name or SKU..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
              {productSearch && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredProducts.slice(0, 10).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addItem(p)}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex justify-between"
                      >
                        <span>{p.name} ({p.sku})</span>
                        <span>{CURRENCY} {Number(p.cost_price || 0).toLocaleString()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {form.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Product</th>
                      <th className="pb-2 text-right w-24">Qty</th>
                      <th className="pb-2 text-right w-28">Unit cost</th>
                      <th className="pb-2 text-right w-28">Subtotal</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((i) => {
                      const p = products.find((x) => x.id === i.productId);
                      return (
                        <tr key={i.productId} className="border-b border-slate-100">
                          <td className="py-2">{p?.name || i.productId}</td>
                          <td className="py-2 text-right">
                            <input
                              type="number"
                              min="0.01"
                              step="1"
                              value={i.quantity}
                              onChange={(e) => updateItem(i.productId, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-16 text-right border border-slate-200 rounded px-1 py-0.5"
                            />
                          </td>
                          <td className="py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={i.unitCost}
                              onChange={(e) => updateItem(i.productId, 'unitCost', parseFloat(e.target.value) || 0)}
                              className="w-24 text-right border border-slate-200 rounded px-1 py-0.5"
                            />
                          </td>
                          <td className="py-2 text-right font-medium">{CURRENCY} {i.subtotal.toLocaleString()}</td>
                          <td>
                            <button type="button" onClick={() => removeItem(i.productId)} className="text-rose-500 hover:underline text-xs">
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-2 flex justify-end gap-4 text-sm">
                  <span>Subtotal: {CURRENCY} {subtotal.toLocaleString()}</span>
                  <span>Tax: {CURRENCY} {taxTotal.toLocaleString()}</span>
                  <span className="font-bold">Total: {CURRENCY} {totalAmount.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment status</label>
                <Select
                  value={form.paymentStatus}
                  onChange={(e) => setForm((f) => ({ ...f, paymentStatus: e.target.value as any }))}
                >
                  <option value="Credit">Credit (pay later)</option>
                  <option value="Paid">Paid in full</option>
                  <option value="Partial">Partial payment</option>
                </Select>
              </div>
              {(form.paymentStatus === 'Paid' || form.paymentStatus === 'Partial') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount paid now</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.paidAmount || ''}
                      onChange={(e) => setForm((f) => ({ ...f, paidAmount: parseFloat(e.target.value) || 0 }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Bank account (if Bank)</label>
                    <Select
                      value={form.bankAccountId}
                      onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}
                    >
                      <option value="">Cash</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </Select>
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <Button type="submit" disabled={loading} className="bg-indigo-600 text-white">
              {loading ? 'Saving...' : 'Save purchase bill'}
            </Button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b bg-slate-50">
              <th className="p-3">Bill #</th>
              <th className="p-3">Supplier</th>
              <th className="p-3">Date</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Paid</th>
              <th className="p-3 text-right">Balance</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => (
              <tr key={b.id} className="border-b border-slate-100">
                <td className="p-3 font-medium">{b.bill_number}</td>
                <td className="p-3">{b.supplier_name}</td>
                <td className="p-3">{b.bill_date?.slice(0, 10)}</td>
                <td className="p-3 text-right">{CURRENCY} {Number(b.total_amount).toLocaleString()}</td>
                <td className="p-3 text-right">{CURRENCY} {Number(b.paid_amount).toLocaleString()}</td>
                <td className="p-3 text-right font-medium">{CURRENCY} {Number(b.balance_due).toLocaleString()}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    b.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                    b.status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bills.length === 0 && <p className="text-slate-400 p-6 text-center">No purchase bills yet</p>}
      </div>
    </div>
  );
}
