import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { procurementApi, shopApi } from '../../../services/shopApi';
import { createPurchaseBillOfflineFirst, setProcurementCache } from '../../../services/procurementSyncService';
import { getProcurementCache, getTenantId } from '../../../services/procurementOfflineCache';
import { useAppContext } from '../../../context/AppContext';
import { useInventory } from '../../../context/InventoryContext';
import Button from '../../ui/Button';
import { CURRENCY } from '../../../constants';
import { MessageCircle, Pencil, Trash2, Wallet } from 'lucide-react';
import {
  generatePurchaseOrderPdfBlob,
  sharePurchaseOrderPdfToWhatsApp,
  type PurchaseOrderPdfInput,
} from '../../../services/procurement/purchaseOrderPdf';
import AddVendorModal from './AddVendorModal';
import AddOrEditSkuModal from '../pos/AddOrEditSkuModal';
import { useClickOutside } from '../../../hooks/useClickOutside';
import SupplierSelect, { type VendorOption } from './SupplierSelect';
import ProductSearchInput, { type ProductOption } from './ProductSearchInput';
import PurchaseItemRow, { type LineItem } from './PurchaseItemRow';

function newLineId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultExpiryDate(): string {
  return new Date().toISOString().slice(0, 10);
}
import TotalSummaryCard from './TotalSummaryCard';
import PaymentSelector, { type PaymentStatus } from './PaymentSelector';
import { showProcurementToast } from './utils/showProcurementToast';
import Badge from '../../ui/Badge';

function normalizeList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as { data: T[] }).data)) return (raw as { data: T[] }).data;
  return [];
}

export interface PurchaseBillsSectionHandle {
  openNewPurchaseBill: () => void;
}

interface PurchaseBillsSectionProps {
  onPayRemaining?: (bill: { id: string; supplier_id?: string; supplier_name?: string; balance_due: number }) => void;
}

const PurchaseBillsSection = forwardRef<PurchaseBillsSectionHandle, PurchaseBillsSectionProps>(
  function PurchaseBillsSection({ onPayRemaining }, ref) {
    const { state: appState, dispatch: appDispatch } = useAppContext();
    const inventory = useInventory();
    const [bills, setBills] = useState<any[]>([]);
    const [vendorsFromApi, setVendorsFromApi] = useState<any[]>([]);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [form, setForm] = useState({
      supplierId: '',
      billNumber: `PB-${Date.now()}`,
      billDate: new Date().toISOString().slice(0, 10),
      dueDate: '',
      items: [] as LineItem[],
      paymentStatus: 'Credit' as PaymentStatus,
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
    const [editBillId, setEditBillId] = useState<string | null>(null);
    const [deleteConfirmBillId, setDeleteConfirmBillId] = useState<string | null>(null);
    const [updating, setUpdating] = useState(false);
    const [sharePdfToWhatsAppAfterSave, setSharePdfToWhatsAppAfterSave] = useState(false);
    const [receiptShop, setReceiptShop] = useState<{ name?: string; address?: string; phone?: string }>({});
    const [sharingPdfBillId, setSharingPdfBillId] = useState<string | null>(null);
    const [formErrors, setFormErrors] = useState<{ supplier?: string; items?: string }>({});

    const vendors: VendorOption[] = (vendorsFromApi.length > 0 ? vendorsFromApi : appState.vendors || []) as VendorOption[];

    const selectedVendor = vendors.find((v) => v.id === form.supplierId);
    const vendorDisplayName = selectedVendor
      ? `${selectedVendor.name}${(selectedVendor.company_name ?? selectedVendor.companyName) ? ` (${selectedVendor.company_name ?? selectedVendor.companyName})` : ''}`
      : '';

    const inventoryItems = inventory?.items ?? [];
    const productsForDropdown: ProductOption[] = inventoryItems.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode ?? '',
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
            setBankAccounts(normalizeList(ba));
            setProcurementCache(tenantId, { purchaseBills: normalizeList(b) }).catch(() => {});
          })
          .catch(() => {
            if (tenantId) {
              getProcurementCache(tenantId)
                .then((c) => {
                  if (c?.data?.purchaseBills?.length) setBills(c.data.purchaseBills);
                })
                .catch(() => {});
            }
            setBills([]);
            setVendorsFromApi([]);
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

    useEffect(() => {
      shopApi
        .getReceiptSettings()
        .then((s: any) => {
          setReceiptShop({
            name: s?.shop_name,
            address: s?.shop_address,
            phone: s?.shop_phone,
          });
        })
        .catch(() => {});
    }, []);

    const refreshItemsRef = useRef(inventory?.refreshItems);
    refreshItemsRef.current = inventory?.refreshItems;

    useEffect(() => {
      if (showForm) {
        loadBillsAndFormData();
        refreshItemsRef.current?.();
      }
    }, [showForm, loadBillsAndFormData]);

    useClickOutside(
      vendorDropdownRef,
      () => setVendorDropdownOpen(false),
      vendorDropdownOpen && !editBillId
    );
    useClickOutside(productSearchRef, () => setProductDropdownOpen(false), productDropdownOpen);

    const subtotal = form.items.reduce((s, i) => s + i.subtotal, 0);
    const taxTotal = form.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
    const totalAmount = subtotal + taxTotal;

    useEffect(() => {
      if (form.paymentStatus === 'Paid') {
        setForm((f) => ({ ...f, paidAmount: totalAmount }));
      }
    }, [form.paymentStatus, totalAmount]);

    const addItem = (p: ProductOption) => {
      const unitCost = Number(p.cost_price ?? p.costPrice ?? p.average_cost) || 0;
      setForm((f) => ({
        ...f,
        items: [
          ...f.items,
          {
            lineId: newLineId(),
            productId: p.id,
            quantity: 1,
            unitCost,
            taxAmount: 0,
            subtotal: unitCost,
            expiryDate: defaultExpiryDate(),
            batchNo: '',
          },
        ],
      }));
      showProcurementToast('Product added', 'success');
      setProductSearch('');
    };

    const updateItem = (lineId: string, field: string, value: number | string) => {
      setForm((f) => ({
        ...f,
        items: f.items.map((i) => {
          if (i.lineId !== lineId) return i;
          const next = { ...i, [field]: value } as LineItem;
          if (field === 'quantity' || field === 'unitCost') {
            next.subtotal = next.quantity * next.unitCost;
          }
          return next;
        }),
      }));
    };

    const removeItem = (lineId: string) => {
      setForm((f) => ({ ...f, items: f.items.filter((i) => i.lineId !== lineId) }));
    };

    const resetFormFields = useCallback(() => {
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
      setVendorSearch('');
      setProductSearch('');
      setEditBillId(null);
      setFormErrors({});
    }, []);

    const closeForm = useCallback(() => {
      resetFormFields();
      setShowForm(false);
    }, [resetFormFields]);

    useImperativeHandle(
      ref,
      () => ({
        openNewPurchaseBill: () => {
          resetFormFields();
          setShowForm(true);
        },
      }),
      [resetFormFields]
    );

    const runSharePdfFromSnapshot = async (snap: {
      form: typeof form;
      vendor: any;
      sub: number;
      tax: number;
      total: number;
    }) => {
      const f = snap.form;
      const lines = f.items.map((i) => {
        const p = productsForDropdown.find((x) => x.id === i.productId) ?? inventoryItems.find((x) => x.id === i.productId);
        return {
          productName: p?.name ?? 'Product',
          sku: p?.sku,
          quantity: Math.max(1, Math.floor(i.quantity)),
          unitCost: i.unitCost,
          taxAmount: i.taxAmount || 0,
          subtotal: i.subtotal,
        };
      });
      const v = snap.vendor;
      const supplierName = v
        ? `${v.name}${(v.company_name ?? v.companyName) ? ` (${v.company_name ?? v.companyName})` : ''}`
        : '';
      const input: PurchaseOrderPdfInput = {
        shopName: receiptShop.name || 'My Shop',
        shopAddress: receiptShop.address,
        shopPhone: receiptShop.phone,
        billNumber: f.billNumber,
        billDate: f.billDate,
        dueDate: f.dueDate || undefined,
        supplierName,
        supplierPhone: v?.contact_no ?? v?.contactNo,
        supplierAddress: v?.address,
        paymentStatus: f.paymentStatus,
        notes: f.notes || undefined,
        lines,
        subtotal: snap.sub,
        taxTotal: snap.tax,
        totalAmount: snap.total,
        currencyLabel: CURRENCY,
      };
      const blob = generatePurchaseOrderPdfBlob(input);
      const fn = `Purchase-order-${String(f.billNumber).replace(/[^\w.-]+/g, '_')}.pdf`;
      await sharePurchaseOrderPdfToWhatsApp(blob, fn, { vendorPhone: input.supplierPhone });
    };

    const shareExistingBillToWhatsApp = async (billId: string) => {
      setSharingPdfBillId(billId);
      try {
        const bill = await procurementApi.getPurchaseBillById(billId);
        if (!bill || !(bill.items?.length > 0)) {
          alert('Could not load bill or bill has no lines.');
          return;
        }
        const lines = (bill.items || []).map((it: any) => ({
          productName: it.product_name || it.productName || 'Product',
          sku: it.sku,
          quantity: Number(it.quantity) || 1,
          unitCost: Number(it.unit_cost ?? it.unitCost) || 0,
          taxAmount: Number(it.tax_amount ?? it.taxAmount) || 0,
          subtotal: Number(it.subtotal) || 0,
        }));
        const input: PurchaseOrderPdfInput = {
          shopName: receiptShop.name || 'My Shop',
          shopAddress: receiptShop.address,
          shopPhone: receiptShop.phone,
          billNumber: bill.bill_number || bill.billNumber || '',
          billDate: String(bill.bill_date || bill.billDate || '').slice(0, 10),
          dueDate: bill.due_date ? String(bill.due_date).slice(0, 10) : undefined,
          supplierName: bill.supplier_name || '',
          supplierPhone: bill.supplier_phone || bill.supplierPhone,
          supplierAddress: undefined,
          paymentStatus: bill.status,
          notes: bill.notes || undefined,
          lines,
          subtotal: Number(bill.subtotal) || 0,
          taxTotal: Number(bill.tax_total ?? bill.taxTotal) || 0,
          totalAmount: Number(bill.total_amount ?? bill.totalAmount) || 0,
          currencyLabel: CURRENCY,
        };
        const blob = generatePurchaseOrderPdfBlob(input);
        const fn = `Purchase-order-${String(input.billNumber).replace(/[^\w.-]+/g, '_')}.pdf`;
        await sharePurchaseOrderPdfToWhatsApp(blob, fn, { vendorPhone: input.supplierPhone });
      } catch (err: any) {
        alert(err?.response?.data?.error || err?.message || 'Could not share PDF');
      } finally {
        setSharingPdfBillId(null);
      }
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const nextErrors: { supplier?: string; items?: string } = {};
      if (!form.supplierId) nextErrors.supplier = 'Select a supplier';
      if (form.items.length === 0) nextErrors.items = 'Add at least one product';
      if (Object.keys(nextErrors).length) {
        setFormErrors(nextErrors);
        return;
      }
      setFormErrors({});
      const today = new Date().toISOString().slice(0, 10);
      for (const row of form.items) {
        const exp = (row.expiryDate || '').trim().slice(0, 10);
        if (!exp) {
          alert('Each line must have an expiry date.');
          return;
        }
        if (exp < today) {
          alert('Expiry date must be today or a future date.');
          return;
        }
        const qty = Math.max(1, Math.floor(row.quantity));
        if (qty <= 0) {
          alert('Quantity must be greater than zero on each line.');
          return;
        }
        if (row.unitCost < 0) {
          alert('Cost price cannot be negative.');
          return;
        }
      }
      setLoading(true);
      try {
        const itemsPayload = form.items.map((i) => {
          const qty = Math.max(1, Math.floor(i.quantity));
          return {
            productId: i.productId,
            quantity: qty,
            unitCost: i.unitCost,
            taxAmount: i.taxAmount || 0,
            subtotal: qty * i.unitCost,
            expiryDate: i.expiryDate.trim().slice(0, 10),
            batchNo: i.batchNo?.trim() || undefined,
          };
        });
        const sub = itemsPayload.reduce((s, i) => s + i.subtotal, 0);
        const tax = form.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
        const total = sub + tax;

        const doSharePdf = sharePdfToWhatsAppAfterSave && !editBillId;
        const vendorForSnap = selectedVendor ?? vendors.find((v) => v.id === form.supplierId);
        const snapshotForPdf =
          doSharePdf && vendorForSnap
            ? {
                form: { ...form, items: form.items.map((i) => ({ ...i })) },
                vendor: vendorForSnap,
                sub,
                tax,
                total,
              }
            : null;

        if (editBillId) {
          await procurementApi.updatePurchaseBill(editBillId, {
            billNumber: form.billNumber,
            billDate: form.billDate,
            dueDate: form.dueDate || undefined,
            notes: form.notes || undefined,
            items: itemsPayload,
            subtotal: sub,
            taxTotal: tax,
            totalAmount: total,
          });
          closeForm();
          showProcurementToast('Purchase bill updated', 'success');
          const list = await procurementApi.getPurchaseBills();
          setBills(Array.isArray(list) ? list : []);
          refreshItemsRef.current?.();
          return;
        }

        const payload = {
          supplierId: form.supplierId,
          billNumber: form.billNumber,
          billDate: form.billDate,
          dueDate: form.dueDate || undefined,
          items: itemsPayload,
          subtotal: sub,
          taxTotal: tax,
          totalAmount: total,
          paymentStatus: form.paymentStatus,
          paidAmount: form.paymentStatus !== 'Credit' ? form.paidAmount || total : 0,
          bankAccountId: form.bankAccountId || undefined,
          notes: form.notes || undefined,
        };
        const result = await createPurchaseBillOfflineFirst(payload);
        if (result.synced) {
          closeForm();
          showProcurementToast('Purchase bill saved', 'success');
          setSharePdfToWhatsAppAfterSave(false);
          const list = await procurementApi.getPurchaseBills();
          setBills(Array.isArray(list) ? list : []);
          if (snapshotForPdf) {
            try {
              await runSharePdfFromSnapshot(snapshotForPdf);
            } catch (shareErr: any) {
              console.error(shareErr);
              alert(shareErr?.message || 'Bill saved, but sharing the PDF to WhatsApp failed.');
            }
          }
        } else if (result.localId) {
          closeForm();
          showProcurementToast('Bill saved offline — will sync when online', 'success');
          setSharePdfToWhatsAppAfterSave(false);
          console.warn('Purchase bill saved offline. Will sync when back online.');
          if (snapshotForPdf) {
            try {
              await runSharePdfFromSnapshot(snapshotForPdf);
            } catch (shareErr: any) {
              console.error(shareErr);
              alert(shareErr?.message || 'Bill queued offline, but PDF could not be shared.');
            }
          }
        }
      } catch (err: any) {
        alert(err?.response?.data?.error || err?.message || (editBillId ? 'Failed to update purchase bill' : 'Failed to create purchase bill'));
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="section-title">Purchase bills</h2>
          <p className="body-text text-muted-foreground">Review and manage recorded purchase bills.</p>
        </div>

        {showForm && (
          <div
            className={`card p-4 sm:p-5 ${
              form.items.length > 0 ? 'pb-40 md:pb-5' : ''
            }`}
          >
            <h3 className="card-title mb-3">
              {editBillId ? 'Edit purchase bill' : 'Create purchase bill'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
                <div ref={vendorDropdownRef} className="min-w-0">
                  <SupplierSelect
                    vendors={vendors}
                    supplierId={form.supplierId}
                    vendorSearch={vendorSearch}
                    vendorDisplayName={vendorDisplayName}
                    vendorDropdownOpen={vendorDropdownOpen}
                    autoFocus={!editBillId}
                    disabled={!!editBillId}
                    loadingData={loadingData}
                    onVendorSearchChange={setVendorSearch}
                    onOpenChange={setVendorDropdownOpen}
                    onSelect={(v) => {
                      setForm((f) => ({ ...f, supplierId: v.id }));
                      setVendorSearch(
                        `${v.name}${(v.company_name ?? v.companyName) ? ` (${v.company_name ?? v.companyName})` : ''}`
                      );
                      setVendorDropdownOpen(false);
                      if (formErrors.supplier) setFormErrors((e) => ({ ...e, supplier: undefined }));
                    }}
                    onAddSupplier={() => setShowAddVendorModal(true)}
                  />
                  {formErrors.supplier && <p className="mt-1 text-xs font-medium text-destructive">{formErrors.supplier}</p>}
                </div>
                <div>
                  <label className="label mb-0.5 block">Bill date *</label>
                  <input
                    type="date"
                    value={form.billDate}
                    onChange={(e) => setForm((f) => ({ ...f, billDate: e.target.value }))}
                    aria-label="Bill date"
                    className="input input-text"
                    required
                  />
                </div>
                <div>
                  <label className="label mb-0.5 block">Bill number</label>
                  <input
                    type="text"
                    readOnly={!editBillId}
                    value={form.billNumber}
                    onChange={(e) => setForm((f) => ({ ...f, billNumber: e.target.value }))}
                    aria-label="Bill number"
                    className="input input-text cursor-default bg-muted read-only:opacity-90"
                  />
                </div>
                <div>
                  <label className="label mb-0.5 block">Due date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    aria-label="Due date"
                    className="input input-text"
                  />
                </div>
              </div>

              <div ref={productSearchRef}>
                <ProductSearchInput
                  currencyLabel={CURRENCY}
                  productSearch={productSearch}
                  dropdownOpen={productDropdownOpen}
                  products={productsForDropdown}
                  loadingData={loadingData}
                  onSearchChange={setProductSearch}
                  onOpenChange={setProductDropdownOpen}
                  onSelectProduct={(p) => addItem(p)}
                  onEnterAdd={(p) => addItem(p)}
                  onAddSku={() => setShowAddSkuModal(true)}
                />
                {formErrors.items && <p className="mt-1 text-xs font-medium text-destructive">{formErrors.items}</p>}
              </div>

              {form.items.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="table-modern min-w-[960px]">
                      <thead className="sticky top-0 z-10 hidden border-b border-border bg-card shadow-erp md:table-header-group">
                        <tr>
                          <th className="table-header w-12 whitespace-nowrap text-center" title="Serial number">
                            S.No
                          </th>
                          <th className="table-header whitespace-nowrap">Product name</th>
                          <th className="table-header whitespace-nowrap">Stock</th>
                          <th className="table-header whitespace-nowrap">Quantity</th>
                          <th className="table-header whitespace-nowrap text-right">Unit cost</th>
                          <th className="table-header whitespace-nowrap">Expiry *</th>
                          <th className="table-header whitespace-nowrap">Batch</th>
                          <th className="table-header whitespace-nowrap text-right">Subtotal</th>
                          <th className="table-header w-12" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.map((i, idx) => {
                          const p = productsForDropdown.find((x) => x.id === i.productId) ?? inventoryItems.find((x) => x.id === i.productId);
                          const invItem = inventoryItems.find((x) => x.id === i.productId);
                          const existingStock = invItem != null ? invItem.onHand : null;
                          return (
                            <PurchaseItemRow
                              key={i.lineId}
                              line={i}
                              serialNumber={idx + 1}
                              productName={p?.name || i.productId}
                              currencyLabel={CURRENCY}
                              stock={existingStock}
                              reorderPoint={invItem?.reorderPoint}
                              zebra={idx % 2 === 1}
                              onQuantityChange={(q) => updateItem(i.lineId, 'quantity', q)}
                              onUnitCostChange={(c) => updateItem(i.lineId, 'unitCost', c)}
                              onExpiryChange={(d) => updateItem(i.lineId, 'expiryDate', d)}
                              onBatchNoChange={(b) => updateItem(i.lineId, 'batchNo', b)}
                              onRemove={() => removeItem(i.lineId)}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-border p-4">
                    <TotalSummaryCard
                      currencyLabel={CURRENCY}
                      subtotal={subtotal}
                      tax={taxTotal}
                      total={totalAmount}
                      stickyMobile
                    />
                  </div>
                </div>
              )}

              {!editBillId && (
                <PaymentSelector
                  value={form.paymentStatus}
                  onChange={(v) => setForm((f) => ({ ...f, paymentStatus: v }))}
                  paidAmount={form.paidAmount}
                  onPaidAmountChange={(n) => setForm((f) => ({ ...f, paidAmount: n }))}
                  totalAmount={totalAmount}
                  bankAccountId={form.bankAccountId}
                  onBankAccountChange={(id) => setForm((f) => ({ ...f, bankAccountId: id }))}
                  bankAccounts={bankAccounts.map((b) => ({ id: b.id, name: b.name }))}
                />
              )}

              <details className="group rounded-lg border border-border bg-muted open:bg-card">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-foreground">
                  <span className="text-muted-foreground">Notes</span>
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(optional — click to expand)</span>
                </summary>
                <div className="border-t border-border px-3 pb-3 pt-2">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="input input-text min-h-[72px] resize-y placeholder:text-muted-foreground"
                    placeholder="Add remarks for this purchase..."
                    rows={3}
                  />
                </div>
              </details>

              {!editBillId && (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={sharePdfToWhatsAppAfterSave}
                    onChange={(e) => setSharePdfToWhatsAppAfterSave(e.target.checked)}
                    className="mt-1 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>After save, share purchase order as PDF on WhatsApp</span>
                </label>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => closeForm()}
                  className="btn-secondary rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-primary active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary rounded-lg px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? 'Saving…' : editBillId ? 'Update purchase bill' : 'Save bill'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="table-modern min-w-[800px]">
              <thead>
                <tr>
                  <th className="table-header py-3 px-4">Bill #</th>
                  <th className="table-header p-3">Supplier</th>
                  <th className="table-header p-3">Date</th>
                  <th className="table-header p-3 text-right">Total</th>
                  <th className="table-header p-3 text-right">Paid</th>
                  <th className="table-header p-3 text-right">Balance</th>
                  <th className="table-header p-3">Status</th>
                  <th className="table-header w-44 p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const balanceDue = Number(b.balance_due) || 0;
                  const hasBalance = balanceDue > 0;
                  return (
                    <tr
                      key={b.id}
                      className="transition-all duration-200 border-b border-border hover:bg-table-row-hover"
                    >
                      <td className="p-3 text-sm font-medium text-foreground">{b.bill_number}</td>
                      <td className="p-3 text-sm text-foreground">{b.supplier_name}</td>
                      <td className="p-3 text-sm text-muted-foreground">{b.bill_date?.slice(0, 10)}</td>
                      <td className="numeric-data p-3 text-right text-foreground">
                        {CURRENCY} {Number(b.total_amount).toLocaleString()}
                      </td>
                      <td className="numeric-data p-3 text-right text-muted-foreground">
                        {CURRENCY} {Number(b.paid_amount).toLocaleString()}
                      </td>
                      <td className="numeric-data p-3 text-right text-foreground">
                        {CURRENCY} {balanceDue.toLocaleString()}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            b.status === 'Paid' ? 'success' : b.status === 'Partial' ? 'warning' : 'outline'
                          }
                        >
                          {b.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => shareExistingBillToWhatsApp(b.id)}
                            disabled={!!sharingPdfBillId}
                            className="transition-all duration-200 rounded-lg p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-success disabled:opacity-50"
                            title="Share purchase order PDF on WhatsApp"
                          >
                            <MessageCircle className={`h-4 w-4 ${sharingPdfBillId === b.id ? 'animate-pulse' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const bill = await procurementApi.getPurchaseBillById(b.id);
                                if (!bill || !bill.items?.length) {
                                  alert('Could not load bill or bill has no items.');
                                  return;
                                }
                                setForm({
                                  supplierId: bill.supplier_id || bill.supplierId || '',
                                  billNumber: bill.bill_number || bill.billNumber || '',
                                  billDate: (bill.bill_date || bill.billDate || '').toString().slice(0, 10),
                                  dueDate: (bill.due_date || bill.dueDate || '').toString().slice(0, 10) || '',
                                  items: bill.items.map((it: any) => ({
                                    lineId: newLineId(),
                                    productId: it.product_id || it.productId,
                                    quantity: Number(it.quantity) || 1,
                                    unitCost: Number(it.unit_cost ?? it.unitCost) || 0,
                                    taxAmount: Number(it.tax_amount ?? it.taxAmount) || 0,
                                    subtotal: Number(it.subtotal) || 0,
                                    expiryDate: String(
                                      it.expiry_date ?? it.expiryDate ?? defaultExpiryDate()
                                    ).slice(0, 10),
                                    batchNo: String(it.batch_no ?? it.batchNo ?? ''),
                                  })),
                                  paymentStatus: 'Credit',
                                  paidAmount: 0,
                                  bankAccountId: '',
                                  notes: bill.notes || '',
                                });
                                setVendorSearch(bill.supplier_name || '');
                                setEditBillId(b.id);
                                setShowForm(true);
                              } catch (err: any) {
                                alert(err?.response?.data?.error || err?.message || 'Failed to load bill');
                              }
                            }}
                            className="transition-all duration-200 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-primary"
                            title="Edit bill"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmBillId(b.id)}
                            className="transition-all duration-200 rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-destructive"
                            title="Delete bill"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {onPayRemaining && hasBalance && (
                            <button
                              type="button"
                              onClick={() =>
                                onPayRemaining({
                                  id: b.id,
                                  supplier_id: b.supplier_id,
                                  supplier_name: b.supplier_name,
                                  balance_due: balanceDue,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-primary transition-all duration-200 hover:bg-accent"
                              title="Pay remaining amount"
                            >
                              <Wallet className="h-4 w-4" />
                              Pay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {bills.length === 0 && <p className="p-6 text-center text-muted-foreground">No purchase bills yet</p>}
        </div>

        {deleteConfirmBillId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => !updating && setDeleteConfirmBillId(null)}
          >
            <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <p className="mb-4 font-medium text-foreground">
                Delete this purchase bill? This will reverse accounting and inventory. Bills with supplier payments applied cannot be deleted.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    setUpdating(true);
                    try {
                      await procurementApi.deletePurchaseBill(deleteConfirmBillId);
                      setDeleteConfirmBillId(null);
                      showProcurementToast('Purchase bill deleted', 'success');
                      const list = await procurementApi.getPurchaseBills();
                      setBills(Array.isArray(list) ? list : []);
                      refreshItemsRef.current?.();
                    } catch (err: any) {
                      alert(err?.response?.data?.error || err?.message || 'Failed to delete bill');
                    } finally {
                      setUpdating(false);
                    }
                  }}
                  disabled={updating}
                  variant="danger"
                >
                  {updating ? 'Deleting...' : 'Delete'}
                </Button>
                <Button onClick={() => !updating && setDeleteConfirmBillId(null)} variant="secondary">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

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
            const p: ProductOption = {
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
);

export default PurchaseBillsSection;
