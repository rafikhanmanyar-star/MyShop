import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
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
import TotalSummaryCard from './TotalSummaryCard';
import PaymentSelector, { type PaymentStatus } from './PaymentSelector';
import { showProcurementToast } from './utils/showProcurementToast';
import Badge from '../../ui/Badge';
import Modal from '../../ui/Modal';

function newLineId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultExpiryDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Normalize expiry from API (string, ISO datetime, or Date) without defaulting to today — used when loading existing bill lines */
function isoDateFromPurchaseApi(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const t = value.trim();
    const ymd = t.match(/^(\d{4}-\d{2}-\d{2})/);
    if (ymd) return ymd[1];
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function normalizeList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as { data: T[] }).data)) return (raw as { data: T[] }).data;
  return [];
}

/** Only posted bills with an outstanding balance can be paid from supplier payments. */
function purchaseBillCanPay(b: { is_posted?: unknown; balance_due?: unknown }): boolean {
  const posted = b.is_posted !== false && b.is_posted !== 0;
  if (!posted) return false;
  return (Number(b.balance_due) || 0) > 0;
}

/** Drafts stay editable; posted bills are editable only until any payment (or zero balance). */
function purchaseBillCanEdit(b: {
  is_posted?: unknown;
  paid_amount?: unknown;
  status?: unknown;
  balance_due?: unknown;
  total_amount?: unknown;
}): boolean {
  if (b.is_posted === false || b.is_posted === 0) return true;
  const paid = Number(b.paid_amount) || 0;
  if (paid > 0) return false;
  const st = String(b.status ?? '').trim();
  if (st === 'Paid' || st === 'Partial') return false;
  const bal = Number(b.balance_due);
  const tot = Number(b.total_amount);
  if (!Number.isNaN(tot) && tot > 0 && !Number.isNaN(bal) && bal <= 0) return false;
  return true;
}

/** fetch-based apiClient surfaces `{ error }`; legacy axios used `response.data.error`. */
function procurementHttpErr(err: unknown, fallback: string): string {
  const e = err as { error?: string; message?: string; response?: { data?: { error?: string } } };
  return e?.error || e?.response?.data?.error || e?.message || fallback;
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
    const [editingIsDraft, setEditingIsDraft] = useState(false);
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

    /** Loaded directly from API so procurement works even when Inventory context is still empty. */
    const [catalogProducts, setCatalogProducts] = useState<ProductOption[]>([]);
    const [loadingCatalog, setLoadingCatalog] = useState(false);

    const productsForDropdown: ProductOption[] = useMemo(() => {
      const byId = new Map<string, ProductOption>();
      for (const p of catalogProducts) {
        byId.set(p.id, { ...p });
      }
      for (const item of inventoryItems) {
        const prev = byId.get(item.id);
        byId.set(item.id, {
          id: item.id,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode ?? '',
          cost_price: item.costPrice,
          costPrice: item.costPrice,
          average_cost: prev?.average_cost,
        });
      }
      return Array.from(byId.values());
    }, [catalogProducts, inventoryItems]);

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

    useEffect(() => {
      if (!showForm) return;
      let cancelled = false;
      setLoadingCatalog(true);
      shopApi
        .getProducts()
        .then((rows) => {
          if (cancelled || !Array.isArray(rows)) return;
          setCatalogProducts(
            rows.map((p: any) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              barcode: p.barcode ?? '',
              cost_price: parseFloat(String(p.cost_price ?? 0)),
              costPrice: parseFloat(String(p.cost_price ?? 0)),
              average_cost: p.average_cost != null ? parseFloat(String(p.average_cost)) : undefined,
            }))
          );
        })
        .catch(() => {
          if (!cancelled) setCatalogProducts([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingCatalog(false);
        });
      return () => {
        cancelled = true;
      };
    }, [showForm]);

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
            expiryHighlight: true,
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
          if (field === 'expiryDate') {
            next.expiryHighlight = false;
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
      setEditingIsDraft(false);
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
        alert(procurementHttpErr(err, 'Could not share PDF'));
      } finally {
        setSharingPdfBillId(null);
      }
    };

    const buildPostedItemsPayload = () =>
      form.items.map((i) => {
        const qty = Math.max(1, Math.floor(i.quantity));
        return {
          productId: i.productId,
          quantity: qty,
          unitCost: i.unitCost,
          taxAmount: i.taxAmount || 0,
          subtotal: qty * i.unitCost,
          expiryDate: (i.expiryDate || '').trim().slice(0, 10),
          batchNo: i.batchNo?.trim() || undefined,
        };
      });

    const validatePostedLines = (): boolean => {
      const today = new Date().toISOString().slice(0, 10);
      for (const row of form.items) {
        const exp = (row.expiryDate || '').trim().slice(0, 10);
        if (!exp) {
          alert('Each line must have an expiry date.');
          return false;
        }
        if (exp < today) {
          alert('Expiry date must be today or a future date.');
          return false;
        }
        const qty = Math.max(1, Math.floor(row.quantity));
        if (qty <= 0) {
          alert('Quantity must be greater than zero on each line.');
          return false;
        }
        if (row.unitCost < 0) {
          alert('Cost price cannot be negative.');
          return false;
        }
      }
      return true;
    };

    const handleUpdatePostedBill = async () => {
      const nextErrors: { supplier?: string; items?: string } = {};
      if (!form.supplierId) nextErrors.supplier = 'Select a supplier';
      if (form.items.length === 0) nextErrors.items = 'Add at least one product';
      if (Object.keys(nextErrors).length) {
        setFormErrors(nextErrors);
        return;
      }
      setFormErrors({});
      if (!validatePostedLines()) return;
      if (!editBillId) return;
      setLoading(true);
      try {
        const itemsPayload = buildPostedItemsPayload();
        const sub = itemsPayload.reduce((s, i) => s + i.subtotal, 0);
        const tax = form.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
        const total = sub + tax;
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
      } catch (err: any) {
        alert(procurementHttpErr(err, 'Failed to update purchase bill'));
      } finally {
        setLoading(false);
      }
    };

    const handleSaveDraft = async () => {
      const nextErrors: { supplier?: string; items?: string } = {};
      if (!form.supplierId) nextErrors.supplier = 'Select a supplier';
      if (Object.keys(nextErrors).length) {
        setFormErrors(nextErrors);
        return;
      }
      setFormErrors({});
      const today = new Date().toISOString().slice(0, 10);
      for (const row of form.items) {
        const exp = (row.expiryDate || '').trim().slice(0, 10);
        if (exp && exp < today) {
          alert('Expiry date must be today or a future date.');
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
          const exp = (i.expiryDate || '').trim().slice(0, 10);
          return {
            productId: i.productId,
            quantity: qty,
            unitCost: i.unitCost,
            taxAmount: i.taxAmount || 0,
            subtotal: qty * i.unitCost,
            ...(exp ? { expiryDate: exp } : {}),
            batchNo: i.batchNo?.trim() || undefined,
          };
        });
        const sub = itemsPayload.reduce((s, i) => s + i.subtotal, 0);
        const tax = form.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
        const total = sub + tax;

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
          showProcurementToast('Draft saved', 'success');
          const list = await procurementApi.getPurchaseBills();
          setBills(Array.isArray(list) ? list : []);
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
          paymentStatus: 'Credit' as const,
          paidAmount: 0,
          saveAsDraft: true,
        };
        const result = await createPurchaseBillOfflineFirst(payload);
        if (result.synced) {
          closeForm();
          showProcurementToast('Draft saved', 'success');
          const list = await procurementApi.getPurchaseBills();
          setBills(Array.isArray(list) ? list : []);
        } else if (result.localId) {
          closeForm();
          showProcurementToast('Draft saved offline — will sync when online', 'success');
        }
      } catch (err: any) {
        alert(procurementHttpErr(err, 'Failed to save draft'));
      } finally {
        setLoading(false);
      }
    };

    const handlePostBill = async () => {
      const nextErrors: { supplier?: string; items?: string } = {};
      if (!form.supplierId) nextErrors.supplier = 'Select a supplier';
      if (form.items.length === 0) nextErrors.items = 'Add at least one product';
      if (Object.keys(nextErrors).length) {
        setFormErrors(nextErrors);
        return;
      }
      setFormErrors({});
      if (!validatePostedLines()) return;
      setLoading(true);
      try {
        const itemsPayload = buildPostedItemsPayload();
        const sub = itemsPayload.reduce((s, i) => s + i.subtotal, 0);
        const tax = form.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
        const total = sub + tax;

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

        if (editBillId && editingIsDraft) {
          await procurementApi.postPurchaseBill(editBillId, payload);
          closeForm();
          showProcurementToast('Purchase bill posted — stock updated', 'success');
          const list = await procurementApi.getPurchaseBills();
          setBills(Array.isArray(list) ? list : []);
          refreshItemsRef.current?.();
          return;
        }

        const doSharePdf = sharePdfToWhatsAppAfterSave && (!editBillId || editingIsDraft);
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

        const result = await createPurchaseBillOfflineFirst(payload);
        if (result.synced) {
          closeForm();
          showProcurementToast('Purchase bill saved', 'success');
          setSharePdfToWhatsAppAfterSave(false);
          const list = await procurementApi.getPurchaseBills();
          setBills(Array.isArray(list) ? list : []);
          refreshItemsRef.current?.();
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
        alert(procurementHttpErr(err, editBillId ? 'Failed to post purchase bill' : 'Failed to create purchase bill'));
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

        <Modal
          isOpen={showForm}
          onClose={() => {
            if (!loading) closeForm();
          }}
          title={
            editBillId ? (editingIsDraft ? 'Edit draft purchase bill' : 'Edit purchase bill') : 'Create purchase bill'
          }
          size="full"
          disableScroll
          className="!mx-0 w-full !max-w-none sm:!mx-auto sm:!max-w-[min(100vw-1rem,72rem)]"
        >
          <div className="flex h-full min-h-0 flex-1 flex-col p-3 sm:p-4 md:p-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editBillId && !editingIsDraft) {
                  void handleUpdatePostedBill();
                }
              }}
              className="flex min-h-0 flex-1 flex-col gap-2"
            >
              <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
                <div ref={vendorDropdownRef} className="min-w-0 sm:col-span-2 xl:col-span-1">
                  <SupplierSelect
                    vendors={vendors}
                    supplierId={form.supplierId}
                    vendorSearch={vendorSearch}
                    vendorDisplayName={vendorDisplayName}
                    vendorDropdownOpen={vendorDropdownOpen}
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
                  <label className="label mb-0.5 block">Due date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    aria-label="Due date"
                    className="input input-text"
                  />
                </div>
                <div className="sm:col-span-2 xl:col-span-1">
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
              </div>

              <div ref={productSearchRef} className="shrink-0">
                <ProductSearchInput
                  currencyLabel={CURRENCY}
                  productSearch={productSearch}
                  dropdownOpen={productDropdownOpen}
                  products={productsForDropdown}
                  loadingData={loadingData || loadingCatalog}
                  onSearchChange={setProductSearch}
                  onOpenChange={setProductDropdownOpen}
                  onSelectProduct={(p) => addItem(p)}
                  onEnterAdd={(p) => addItem(p)}
                  onAddSku={() => setShowAddSkuModal(true)}
                />
                {formErrors.items && <p className="mt-1 text-xs font-medium text-destructive">{formErrors.items}</p>}
              </div>

              {form.items.length > 0 && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain [scrollbar-gutter:stable] max-h-[min(60vh,calc(100dvh-18rem))] sm:max-h-[min(65vh,calc(100dvh-16rem))]">
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
                  <div className="shrink-0 border-t border-border p-4">
                    <TotalSummaryCard
                      currencyLabel={CURRENCY}
                      subtotal={subtotal}
                      tax={taxTotal}
                      total={totalAmount}
                    />
                  </div>
                </div>
              )}

              {(!editBillId || editingIsDraft) && (
                <div className="shrink-0">
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
                </div>
              )}

              <details className="group shrink-0 rounded-lg border border-border bg-muted open:bg-card">
                <summary className="cursor-pointer list-none px-2.5 py-1.5 text-sm font-semibold text-foreground">
                  <span className="text-muted-foreground">Notes</span>
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(optional — click to expand)</span>
                </summary>
                <div className="border-t border-border px-2.5 pb-2 pt-1.5">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="input input-text min-h-[52px] resize-y placeholder:text-muted-foreground"
                    placeholder="Add remarks for this purchase..."
                    rows={2}
                  />
                </div>
              </details>

              <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-2 sm:flex-row sm:items-center sm:justify-between">
              {(!editBillId || editingIsDraft) && (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground sm:max-w-[min(100%,28rem)]">
                  <input
                    type="checkbox"
                    checked={sharePdfToWhatsAppAfterSave}
                    onChange={(e) => setSharePdfToWhatsAppAfterSave(e.target.checked)}
                    className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>After posting, share purchase order as PDF on WhatsApp</span>
                </label>
              )}
              <div className={`flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ${editBillId ? 'sm:ml-auto' : ''}`}>
                <button
                  type="button"
                  onClick={() => closeForm()}
                  className="btn-secondary rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-primary active:scale-[0.98]"
                >
                  Cancel
                </button>
                {editBillId && !editingIsDraft ? (
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary rounded-lg px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Saving…' : 'Update purchase bill'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleSaveDraft()}
                      className="btn-secondary rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                    >
                      {loading ? 'Saving…' : 'Save as draft'}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handlePostBill()}
                      className="btn-primary rounded-lg px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
                    >
                      {loading ? 'Posting…' : 'Post bill'}
                    </button>
                  </>
                )}
              </div>
              </div>
            </form>
          </div>
        </Modal>

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
                            b.is_posted === false
                              ? 'default'
                              : b.status === 'Paid'
                                ? 'success'
                                : b.status === 'Partial'
                                  ? 'warning'
                                  : 'outline'
                          }
                        >
                          {b.is_posted === false ? 'Draft' : b.status}
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
                            disabled={!purchaseBillCanEdit(b)}
                            onClick={async () => {
                              if (!purchaseBillCanEdit(b)) {
                                alert('This bill cannot be edited because it has been paid (fully or partially).');
                                return;
                              }
                              try {
                                const bill = await procurementApi.getPurchaseBillById(b.id);
                                if (!bill) {
                                  alert('Could not load bill.');
                                  return;
                                }
                                setEditingIsDraft(bill.is_posted === false || bill.is_posted === 0);
                                setForm({
                                  supplierId: bill.supplier_id || bill.supplierId || '',
                                  billNumber: bill.bill_number || bill.billNumber || '',
                                  billDate: (bill.bill_date || bill.billDate || '').toString().slice(0, 10),
                                  dueDate: (bill.due_date || bill.dueDate || '').toString().slice(0, 10) || '',
                                  items: (bill.items || []).map((it: any) => ({
                                    lineId: newLineId(),
                                    productId: it.product_id || it.productId,
                                    quantity: Number(it.quantity) || 1,
                                    unitCost: Number(it.unit_cost ?? it.unitCost) || 0,
                                    taxAmount: Number(it.tax_amount ?? it.taxAmount) || 0,
                                    subtotal: Number(it.subtotal) || 0,
                                    expiryDate: isoDateFromPurchaseApi(it.expiry_date ?? it.expiryDate),
                                    expiryHighlight: false,
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
                                alert(procurementHttpErr(err, 'Failed to load bill'));
                              }
                            }}
                            className={`transition-all duration-200 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-primary disabled:pointer-events-none disabled:opacity-40`}
                            title={
                              purchaseBillCanEdit(b)
                                ? 'Edit bill'
                                : 'Paid bills cannot be edited'
                            }
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
                          {onPayRemaining && purchaseBillCanPay(b) && (
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
                Delete this purchase bill?
                {deleteConfirmBillId &&
                bills.find((x) => x.id === deleteConfirmBillId)?.is_posted === false
                  ? ' This draft will be removed (no inventory or accounting to reverse).'
                  : ' This will reverse accounting and inventory. Bills with supplier payments applied cannot be deleted.'}
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
                      alert(procurementHttpErr(err, 'Failed to delete bill'));
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
