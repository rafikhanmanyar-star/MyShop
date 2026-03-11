import React, { useState, useEffect, useRef, useCallback } from 'react';
import { procurementApi, shopApi } from '../../../services/shopApi';
import { createPurchaseBillOfflineFirst, setProcurementCache } from '../../../services/procurementSyncService';
import { getProcurementCache, getTenantId } from '../../../services/procurementOfflineCache';
import { useAppContext } from '../../../context/AppContext';
import { useInventory } from '../../../context/InventoryContext';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import { CURRENCY } from '../../../constants';
import { Wallet } from 'lucide-react';
import AddVendorModal from './AddVendorModal';
import AddOrEditSkuModal from '../pos/AddOrEditSkuModal';

function normalizeList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as { data: T[] }).data)) return (raw as { data: T[] }).data;
  return [];
}

interface PurchaseBillsSectionProps {
  onPayRemaining?: (bill: { id: string; supplier_id?: string; supplier_name?: string; balance_due: number }) => void;
}

export default function PurchaseBillsSection({ onPayRemaining }: PurchaseBillsSectionProps) {
  const { state: appState, dispatch: appDispatch } = useAppContext();
  const inventory = useInventory();
  const [bills, setBills] = useState<any[]>([]);
  const [vendorsFromApi, setVendorsFromApi] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
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
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productSearchRef = useRef<HTMLDivElement>(null);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const vendorDropdownRef = useRef<HTMLDivElement>(null);
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [showAddSkuModal, setShowAddSkuModal] = useState(false);

  // Same list as Settings → Vendor Management (from AppContext + API refresh)
  const vendors = vendorsFromApi.length > 0 ? vendorsFromApi : (appState.vendors || []);

  const filteredVendors = vendors.filter(
    (v: any) =>
      !vendorSearch ||
      (v.name || '').toLowerCase().includes(vendorSearch.toLowerCase()) ||
      ((v.company_name ?? v.companyName) || '').toLowerCase().includes(vendorSearch.toLowerCase())
  );

  const selectedVendor = vendors.find((v: any) => v.id === form.supplierId);
  const vendorDisplayName = selectedVendor
    ? `${selectedVendor.name}${(selectedVendor.company_name ?? selectedVendor.companyName) ? ` (${selectedVendor.company_name ?? selectedVendor.companyName})` : ''}`
    : '';

  // Same list as Inventory → Stock Master (from InventoryContext)
  const inventoryItems = inventory?.items ?? [];
  const productsForDropdown = inventoryItems.map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    cost_price: item.costPrice,
    costPrice: item.costPrice,
    average_cost: undefined,
  }));

  const loadBillsAndFormData = useCallback(() => {
    setLoadingData(true);
    const tenantId = getTenantId();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    if (isOnline && tenantId) {
      Promise.all([
        procurementApi.getPurchaseBills(),
        shopApi.getVendors(),
        shopApi.getWarehouses(),
        shopApi.getBankAccounts(),
      ])
        .then(([b, v, w, ba]) => {
          setBills(normalizeList(b));
          const vList = normalizeList(v);
          setVendorsFromApi(vList);
          if (vList.length > 0) {
            appDispatch({
              type: 'SET_VENDORS',
              payload: vList.map((x: any) => ({
                id: x.id,
                name: x.name,
                companyName: x.company_name ?? x.companyName,
                contactNo: x.contact_no ?? x.contactNo,
                email: x.email,
                address: x.address,
                description: x.description,
              })),
            });
          }
          setWarehouses(normalizeList(w));
          setBankAccounts(normalizeList(ba));
          setProcurementCache(tenantId, { purchaseBills: normalizeList(b) }).catch(() => {});
        })
        .catch(() => {
          if (tenantId) {
            getProcurementCache(tenantId).then((c) => {
              if (c?.data?.purchaseBills?.length) setBills(c.data.purchaseBills);
            }).catch(() => {});
          }
          setBills([]);
          setVendorsFromApi([]);
          setWarehouses([]);
          setBankAccounts([]);
        })
        .finally(() => setLoadingData(false));
      return;
    }

    if (tenantId) {
      getProcurementCache(tenantId)
        .then((c) => {
          if (c?.data?.purchaseBills?.length) setBills(c.data.purchaseBills);
        })
        .catch(() => setBills([]))
        .finally(() => setLoadingData(false));
      Promise.all([shopApi.getVendors(), shopApi.getWarehouses(), shopApi.getBankAccounts()])
        .then(([v, w, ba]) => {
          setVendorsFromApi(normalizeList(v));
          setWarehouses(normalizeList(w));
          setBankAccounts(normalizeList(ba));
        })
        .catch(() => {});
      return;
    }

    setLoadingData(false);
  }, [appDispatch]);

  useEffect(() => {
    loadBillsAndFormData();
  }, [loadBillsAndFormData]);

  const refreshItemsRef = useRef(inventory?.refreshItems);
  refreshItemsRef.current = inventory?.refreshItems;

  // When opening the form, refetch vendors and refresh inventory items (Stock Master list)
  useEffect(() => {
    if (showForm) {
      loadBillsAndFormData();
      refreshItemsRef.current?.();
    }
  }, [showForm, loadBillsAndFormData]);

  const subtotal = form.items.reduce((s, i) => s + i.subtotal, 0);
  const taxTotal = form.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
  const totalAmount = subtotal + taxTotal;

  const addItem = (p: any) => {
    const unitCost = Number(p.cost_price ?? p.costPrice ?? p.average_cost) || 0;
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
            unitCost,
            taxAmount: 0,
            subtotal: unitCost,
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

  const filteredProducts = productsForDropdown.filter(
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
      const payload = {
        supplierId: form.supplierId,
        billNumber: form.billNumber,
        billDate: form.billDate,
        dueDate: form.dueDate || undefined,
        items: form.items.map((i) => {
          const qty = Math.max(1, Math.floor(i.quantity));
          return {
            productId: i.productId,
            quantity: qty,
            unitCost: i.unitCost,
            taxAmount: i.taxAmount || 0,
            subtotal: qty * i.unitCost,
          };
        }),
        subtotal,
        taxTotal,
        totalAmount,
        paymentStatus: form.paymentStatus,
        paidAmount: form.paymentStatus !== 'Credit' ? form.paidAmount || totalAmount : 0,
        bankAccountId: form.bankAccountId || undefined,
        notes: form.notes || undefined,
      };
      const result = await createPurchaseBillOfflineFirst(payload);
      if (result.synced) {
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
      } else if (result.localId) {
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
        console.warn('Purchase bill saved offline. Will sync when back online.');
      }
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
              <div ref={vendorDropdownRef} className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">Supplier / Vendor *</label>
                <input
                  type="text"
                  value={vendorDropdownOpen ? vendorSearch : vendorDisplayName || vendorSearch}
                  onChange={(e) => {
                    setVendorSearch(e.target.value);
                    setVendorDropdownOpen(true);
                  }}
                  onFocus={() => setVendorDropdownOpen(true)}
                  onBlur={(e) => {
                    if (vendorDropdownRef.current?.contains(e.relatedTarget as Node)) return;
                    setVendorDropdownOpen(false);
                    if (!form.supplierId && vendorSearch !== vendorDisplayName) setVendorSearch('');
                    if (form.supplierId && !vendorSearch) setVendorSearch(vendorDisplayName);
                  }}
                  placeholder="Search or select supplier..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
                {vendorDropdownOpen && (
                  <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {filteredVendors.length === 0 ? (
                      <li className="px-3 py-2 text-slate-500 text-sm">
                        {vendorSearch ? `No vendor matching "${vendorSearch}"` : 'Type to search'}
                      </li>
                    ) : (
                      filteredVendors.slice(0, 20).map((v: any) => (
                        <li key={v.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setForm((f) => ({ ...f, supplierId: v.id }));
                              setVendorSearch(`${v.name}${(v.company_name ?? v.companyName) ? ` (${v.company_name ?? v.companyName})` : ''}`);
                              setVendorDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 border-b border-slate-50 last:border-0"
                          >
                            {v.name}{(v.company_name ?? v.companyName) ? ` (${v.company_name ?? v.companyName})` : ''}
                          </button>
                        </li>
                      ))
                    )}
                    <li className="border-t border-slate-100">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setShowAddVendorModal(true);
                          setVendorDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 text-indigo-600 font-medium flex items-center gap-2"
                      >
                        + Add new vendor
                      </button>
                    </li>
                  </ul>
                )}
                <p className="text-xs text-slate-500 mt-1">Search by name or company. Can add a new vendor here if not found.</p>
                {!loadingData && vendors.length === 0 && (
                  <p className="text-amber-600 text-xs mt-1">No vendors yet. Use &quot;Add new vendor&quot; above or add in Settings → Vendor Management.</p>
                )}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Add product (inventory SKU)</label>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setProductDropdownOpen(true);
                }}
                onFocus={() => setProductDropdownOpen(true)}
                onBlur={(e) => {
                  if (productSearchRef.current?.contains(e.relatedTarget as Node)) return;
                  setProductDropdownOpen(false);
                }}
                placeholder="Search by product name or SKU..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
              <p className="text-xs text-slate-500 mt-1">Same list as Inventory → Stock Master. Adding updates stock and weighted average cost.</p>
              {!loadingData && productsForDropdown.length === 0 && (
                <p className="text-amber-600 text-xs mt-1">No products yet. Add products in Inventory → Stock Master.</p>
              )}
              {productDropdownOpen && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <li className="px-3 py-4 text-slate-500 text-sm text-center">
                      {productSearch ? `No products matching "${productSearch}"` : 'Type to search by name or SKU'}
                    </li>
                  ) : (
                    filteredProducts.slice(0, 15).map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            addItem(p);
                            setProductDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 flex justify-between items-center border-b border-slate-50 last:border-0"
                        >
                          <span>
                            <span className="font-medium text-slate-800">{p.name}</span>
                            <span className="ml-2 text-xs font-mono text-slate-500">SKU: {p.sku || '—'}</span>
                          </span>
                          <span className="text-sm font-medium text-indigo-600">{CURRENCY} {Number(p.cost_price ?? p.costPrice ?? p.average_cost ?? 0).toLocaleString()}</span>
                        </button>
                      </li>
                    ))
                  )}
                  <li className="border-t border-slate-100">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setShowAddSkuModal(true);
                        setProductDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 text-indigo-600 font-medium flex items-center gap-2"
                    >
                      + Add new SKU{productSearch.trim() ? `: "${productSearch.trim()}"` : ''}
                    </button>
                  </li>
                </ul>
              )}
            </div>

            {form.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Product</th>
                      <th className="pb-2 text-right w-24">Existing stock</th>
                      <th className="pb-2 text-right w-24">Qty</th>
                      <th className="pb-2 text-right w-28">Unit cost</th>
                      <th className="pb-2 text-right w-28">Subtotal</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((i) => {
                      const p = productsForDropdown.find((x) => x.id === i.productId) ?? inventoryItems.find((x) => x.id === i.productId);
                      const invItem = inventoryItems.find((x) => x.id === i.productId);
                      const existingStock = invItem != null ? invItem.onHand : null;
                      return (
                        <tr key={i.productId} className="border-b border-slate-100">
                          <td className="py-2">{p?.name || i.productId}</td>
                          <td className="py-2 text-right font-medium text-slate-600">
                            {existingStock != null ? Number(existingStock).toLocaleString() : '—'}
                          </td>
                          <td className="py-2 text-right">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={Math.max(1, Math.floor(i.quantity))}
                              onChange={(e) => updateItem(i.productId, 'quantity', Math.max(1, Math.floor(parseFloat(e.target.value) || 0)))}
                              onWheel={(e) => e.preventDefault()}
                              className="w-16 text-right border border-slate-200 rounded px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </td>
                          <td className="py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={i.unitCost}
                              onChange={(e) => updateItem(i.productId, 'unitCost', parseFloat(e.target.value) || 0)}
                              onWheel={(e) => e.preventDefault()}
                              className="w-24 text-right border border-slate-200 rounded px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                      onWheel={(e) => e.preventDefault()}
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
              {(onPayRemaining && bills.some((b) => Number(b.balance_due) > 0)) && (
                <th className="p-3 w-24 text-center">Action</th>
              )}
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => {
              const balanceDue = Number(b.balance_due) || 0;
              const hasBalance = balanceDue > 0;
              return (
                <tr key={b.id} className="border-b border-slate-100">
                  <td className="p-3 font-medium">{b.bill_number}</td>
                  <td className="p-3">{b.supplier_name}</td>
                  <td className="p-3">{b.bill_date?.slice(0, 10)}</td>
                  <td className="p-3 text-right">{CURRENCY} {Number(b.total_amount).toLocaleString()}</td>
                  <td className="p-3 text-right">{CURRENCY} {Number(b.paid_amount).toLocaleString()}</td>
                  <td className="p-3 text-right font-medium">{CURRENCY} {balanceDue.toLocaleString()}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      b.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                      b.status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {b.status}
                    </span>
                  </td>
                  {onPayRemaining && (
                    <td className="p-3 text-center">
                      {hasBalance ? (
                        <button
                          type="button"
                          onClick={() => onPayRemaining({ id: b.id, supplier_id: b.supplier_id, supplier_name: b.supplier_name, balance_due: balanceDue })}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Pay remaining amount"
                        >
                          <Wallet className="w-4 h-4" />
                          Pay remaining
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {bills.length === 0 && <p className="text-slate-400 p-6 text-center">No purchase bills yet</p>}
      </div>

      <AddVendorModal
        isOpen={showAddVendorModal}
        onClose={() => setShowAddVendorModal(false)}
        initialName={vendorSearch}
        onSaved={(created) => {
          setForm((f) => ({ ...f, supplierId: created.id }));
          setVendorSearch(`${created.name}${created.company_name ? ` (${created.company_name})` : ''}`);
          loadBillsAndFormData();
        }}
      />

      <AddOrEditSkuModal
        isOpen={showAddSkuModal}
        onClose={() => setShowAddSkuModal(false)}
        initialSkuOrBarcode={productSearch}
        openInAddMode
        onItemReady={(item) => {
          const p = {
            id: item.id,
            name: item.name,
            sku: item.sku,
            cost_price: item.costPrice,
            costPrice: item.costPrice,
            average_cost: undefined,
          };
          addItem(p);
          setProductSearch('');
          setShowAddSkuModal(false);
        }}
      />
    </div>
  );
}
