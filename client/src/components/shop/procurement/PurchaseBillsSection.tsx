import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { procurementApi, shopApi } from '../../../services/shopApi';
import { createPurchaseBillOfflineFirst, setProcurementCache } from '../../../services/procurementSyncService';
import { getProcurementCache, getTenantId } from '../../../services/procurementOfflineCache';
import { useAppContext } from '../../../context/AppContext';
import { useInventory } from '../../../context/InventoryContext';
import Button from '../../ui/Button';
import { CURRENCY } from '../../../constants';
import { Pencil, Trash2, Wallet, Eye, Share2, ChevronLeft, ChevronRight, AlertTriangle, Info } from 'lucide-react';
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
import Modal from '../../ui/Modal';

function newLineId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Default expiry for new lines: same calendar day, one year ahead (YYYY-MM-DD). */
function defaultExpiryDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

const BILL_LIST_PAGE_SIZE = 12;

const ROW_AVATAR_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-600',
  'bg-emerald-100 text-emerald-600',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-600',
  'bg-cyan-100 text-cyan-700',
  'bg-violet-100 text-violet-600',
];

function rowAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ROW_AVATAR_COLORS[Math.abs(hash) % ROW_AVATAR_COLORS.length];
}

function vendorInitialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatBillDateDisplay(ymd: string | undefined): string {
  if (!ymd) return '—';
  const t = String(ymd).trim().slice(0, 10);
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type ProcurementRowStatus = 'PAID' | 'POSTED' | 'AWAITING';

function getProcurementRowStatus(b: { is_posted?: unknown; status?: unknown }): ProcurementRowStatus {
  const posted = b.is_posted !== false && b.is_posted !== 0;
  const st = String(b.status ?? '').trim();
  if (!posted) return 'AWAITING';
  if (st === 'Paid') return 'PAID';
  if (st === 'Partial') return 'AWAITING';
  return 'POSTED';
}

/** Days overdue if due date is before today and there is an outstanding balance. */
function overdueDaysIfAny(dueYmd: string | undefined, balanceDue: number): number | null {
  if (!dueYmd || !(balanceDue > 0)) return null;
  const t = String(dueYmd).trim().slice(0, 10);
  const due = new Date(`${t}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
  return diff > 0 ? diff : null;
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
    const [billListPage, setBillListPage] = useState(1);
    const [viewingBillId, setViewingBillId] = useState<string | null>(null);
    const [viewingBillDetail, setViewingBillDetail] = useState<any | null>(null);
    const [viewBillLoading, setViewBillLoading] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [sharePdfToWhatsAppAfterSave, setSharePdfToWhatsAppAfterSave] = useState(false);
    const [receiptShop, setReceiptShop] = useState<{ name?: string; address?: string; phone?: string }>({});
    const [sharingPdfBillId, setSharingPdfBillId] = useState<string | null>(null);
    const [formErrors, setFormErrors] = useState<{ supplier?: string; items?: string }>({});

    const vendors: VendorOption[] = (vendorsFromApi.length > 0 ? vendorsFromApi : appState.vendors || []) as VendorOption[];

    const vendorById = useMemo(() => {
      const m = new Map<string, VendorOption>();
      for (const v of vendors) {
        if (v?.id) m.set(v.id, v);
      }
      return m;
    }, [vendors]);

    const sortedBills = useMemo(() => {
      return [...bills].sort((a, b) => {
        const ad = String(a.bill_date ?? a.billDate ?? '').slice(0, 10);
        const bd = String(b.bill_date ?? b.billDate ?? '').slice(0, 10);
        return bd.localeCompare(ad);
      });
    }, [bills]);

    const billTotalPages = Math.max(1, Math.ceil(sortedBills.length / BILL_LIST_PAGE_SIZE));
    const billSafePage = Math.min(billListPage, billTotalPages);
    const pagedBills = sortedBills.slice((billSafePage - 1) * BILL_LIST_PAGE_SIZE, billSafePage * BILL_LIST_PAGE_SIZE);

    useEffect(() => {
      setBillListPage(1);
    }, [bills.length]);

    const procurementInsight = useMemo(() => {
      const openAp = sortedBills.reduce((s, b) => s + (Number(b.balance_due) > 0 ? Number(b.balance_due) || 0 : 0), 0);
      const overdueCount = sortedBills.filter((b) => {
        const bal = Number(b.balance_due) || 0;
        return overdueDaysIfAny(String(b.due_date ?? b.dueDate ?? '').slice(0, 10), bal) != null;
      }).length;
      return { openAp, overdueCount, totalBills: sortedBills.length };
    }, [sortedBills]);

    const topOverdueAlert = useMemo(() => {
      const withBalance = sortedBills.filter((b) => (Number(b.balance_due) || 0) > 0);
      let best: { bill: any; days: number } | null = null;
      for (const bill of withBalance) {
        const due = String(bill.due_date ?? bill.dueDate ?? '').slice(0, 10);
        const days = overdueDaysIfAny(due, Number(bill.balance_due) || 0);
        if (days != null && (!best || days > best.days)) best = { bill, days };
      }
      if (!best) return null;
      const name = best.bill.supplier_name || 'A supplier';
      return { name, days: best.days, billNum: best.bill.bill_number || best.bill.billNumber };
    }, [sortedBills]);

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
      if (!viewingBillId) {
        setViewingBillDetail(null);
        return;
      }
      let cancelled = false;
      setViewBillLoading(true);
      setViewingBillDetail(null);
      procurementApi
        .getPurchaseBillById(viewingBillId)
        .then((bill) => {
          if (!cancelled) setViewingBillDetail(bill);
        })
        .catch(() => {
          if (!cancelled) setViewingBillDetail(null);
        })
        .finally(() => {
          if (!cancelled) setViewBillLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [viewingBillId]);

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

        <div className="card overflow-hidden p-0 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="whitespace-nowrap px-4 py-3">Bill ID</th>
                  <th className="whitespace-nowrap px-4 py-3">Vendor</th>
                  <th className="whitespace-nowrap px-4 py-3">Issue date</th>
                  <th className="whitespace-nowrap px-4 py-3">Due date</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Amount</th>
                  <th className="whitespace-nowrap px-4 py-3">Status</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingData && bills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      Loading purchase bills…
                    </td>
                  </tr>
                ) : pagedBills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No purchase bills yet
                    </td>
                  </tr>
                ) : (
                  pagedBills.map((b) => {
                    const balanceDue = Number(b.balance_due) || 0;
                    const rowStatus = getProcurementRowStatus(b);
                    const sid = String(b.supplier_id ?? b.supplierId ?? '');
                    const v = sid ? vendorById.get(sid) : undefined;
                    const vendorTitle = String(v?.company_name || v?.companyName || b.supplier_name || '—').trim();
                    const vendorSub = String(v?.description || '').trim() || 'Supplier';
                    const issue = String(b.bill_date ?? b.billDate ?? '').slice(0, 10);
                    const due = String(b.due_date ?? b.dueDate ?? '').slice(0, 10);
                    const od = overdueDaysIfAny(due, balanceDue);
                    const billNum = String(b.bill_number ?? b.billNumber ?? '');
                    const showView = rowStatus !== 'PAID';
                    const statusClass =
                      rowStatus === 'PAID'
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : rowStatus === 'POSTED'
                          ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                          : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';

                    return (
                      <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold text-foreground">#{billNum}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rowAvatarColor(sid || b.id)}`}
                            >
                              {vendorInitialsFromName(vendorTitle || b.supplier_name || '?')}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-foreground">{vendorTitle}</div>
                              <div className="truncate text-[11px] text-muted-foreground">{vendorSub}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{formatBillDateDisplay(issue)}</td>
                        <td className="px-4 py-3 text-sm">
                          {due ? (
                            <span className={od != null ? 'font-bold text-destructive' : 'text-muted-foreground'}>
                              {formatBillDateDisplay(due)}
                              {od != null && (
                                <span className="ml-1 font-bold text-destructive">Overdue ({od}d)</span>
                              )}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="numeric-data px-4 py-3 text-right text-sm font-bold text-foreground">
                          {CURRENCY}{' '}
                          {Number(b.total_amount ?? b.totalAmount ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${statusClass}`}
                          >
                            {rowStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            {showView && (
                              <button
                                type="button"
                                onClick={() => setViewingBillId(b.id)}
                                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                                title="View bill"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
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
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                              title={purchaseBillCanEdit(b) ? 'Edit bill' : 'Paid bills cannot be edited'}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmBillId(b.id)}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-destructive"
                              title="Delete bill"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => shareExistingBillToWhatsApp(b.id)}
                              disabled={!!sharingPdfBillId}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                              title="Share purchase order PDF on WhatsApp"
                            >
                              <Share2 className={`h-4 w-4 ${sharingPdfBillId === b.id ? 'animate-pulse' : ''}`} />
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
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-primary transition-colors hover:bg-accent"
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
                  })
                )}
              </tbody>
            </table>
          </div>

          {sortedBills.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                Showing {(billSafePage - 1) * BILL_LIST_PAGE_SIZE + 1} to{' '}
                {Math.min(billSafePage * BILL_LIST_PAGE_SIZE, sortedBills.length)} of {sortedBills.length} entries
              </span>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setBillListPage((p) => Math.max(1, p - 1))}
                  disabled={billSafePage <= 1}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(billTotalPages, 5) }, (_, i) => {
                  let pageNum: number;
                  if (billTotalPages <= 5) {
                    pageNum = i + 1;
                  } else if (billSafePage <= 3) {
                    pageNum = i + 1;
                  } else if (billSafePage >= billTotalPages - 2) {
                    pageNum = billTotalPages - 4 + i;
                  } else {
                    pageNum = billSafePage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setBillListPage(pageNum)}
                      className={`h-8 min-w-[32px] rounded-md text-xs font-semibold transition-colors ${
                        billSafePage === pageNum
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setBillListPage((p) => Math.min(billTotalPages, p + 1))}
                  disabled={billSafePage >= billTotalPages}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div>
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">Procurement alert</h3>
                {topOverdueAlert ? (
                  <p className="mt-1 text-sm leading-relaxed text-amber-900/90 dark:text-amber-50/90">
                    <span className="font-medium">{topOverdueAlert.name}</span> has bill{' '}
                    <span className="font-mono">#{topOverdueAlert.billNum}</span> overdue by {topOverdueAlert.days} day
                    {topOverdueAlert.days === 1 ? '' : 's'}. Review payment terms or schedule supplier payment.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-amber-900/85 dark:text-amber-50/85">
                    No overdue payables with an open balance. Outstanding accounts payable total{' '}
                    <span className="font-semibold tabular-nums">
                      {CURRENCY} {procurementInsight.openAp.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    .
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-sky-200/80 bg-sky-50/80 p-4 dark:border-sky-900/50 dark:bg-sky-950/30">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden />
              <div>
                <h3 className="text-sm font-bold text-sky-900 dark:text-sky-100">System insight</h3>
                <p className="mt-1 text-sm leading-relaxed text-sky-900/90 dark:text-sky-50/90">
                  You have <span className="font-semibold">{procurementInsight.totalBills}</span> purchase bill
                  {procurementInsight.totalBills === 1 ? '' : 's'} on record
                  {procurementInsight.overdueCount > 0 ? (
                    <>
                      ; <span className="font-semibold text-destructive">{procurementInsight.overdueCount}</span> with
                      overdue due dates and open balance.
                    </>
                  ) : (
                    <>; no overdue due dates with open balance.</>
                  )}{' '}
                  Open AP:{' '}
                  <span className="font-semibold tabular-nums">
                    {CURRENCY} {procurementInsight.openAp.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>

        <Modal
          isOpen={!!viewingBillId}
          onClose={() => {
            setViewingBillId(null);
            setViewingBillDetail(null);
          }}
          title={viewingBillDetail ? `Bill #${viewingBillDetail.bill_number || viewingBillDetail.billNumber || ''}` : 'Purchase bill'}
          size="lg"
        >
          {viewBillLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : viewingBillDetail ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier</span>
                  <p className="font-medium text-foreground">
                    {viewingBillDetail.supplier_name || viewingBillDetail.supplierName || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
                  <p className="font-medium text-foreground">
                    {viewingBillDetail.is_posted === false || viewingBillDetail.is_posted === 0
                      ? 'Draft'
                      : viewingBillDetail.status || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issue date</span>
                  <p className="text-foreground">
                    {formatBillDateDisplay(String(viewingBillDetail.bill_date || viewingBillDetail.billDate || '').slice(0, 10))}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due date</span>
                  <p className="text-foreground">
                    {viewingBillDetail.due_date || viewingBillDetail.dueDate
                      ? formatBillDateDisplay(String(viewingBillDetail.due_date || viewingBillDetail.dueDate).slice(0, 10))
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
                  <p className="font-semibold tabular-nums text-foreground">
                    {CURRENCY}{' '}
                    {Number(viewingBillDetail.total_amount ?? viewingBillDetail.totalAmount ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Balance due</span>
                  <p className="font-semibold tabular-nums text-foreground">
                    {CURRENCY}{' '}
                    {Number(viewingBillDetail.balance_due ?? viewingBillDetail.balanceDue ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
              {Array.isArray(viewingBillDetail.items) && viewingBillDetail.items.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60 text-[10px] font-semibold uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Unit</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {viewingBillDetail.items.map((it: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-foreground">
                            {it.product_name || it.productName || it.product_id || '—'}
                          </td>
                          <td className="numeric-data px-3 py-2 text-right">{Number(it.quantity) || 0}</td>
                          <td className="numeric-data px-3 py-2 text-right">
                            {CURRENCY} {Number(it.unit_cost ?? it.unitCost ?? 0).toLocaleString()}
                          </td>
                          <td className="numeric-data px-3 py-2 text-right font-medium">
                            {CURRENCY} {Number(it.subtotal ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(viewingBillDetail.notes || '').trim() ? (
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
                  <p className="mt-1 whitespace-pre-wrap text-foreground">{String(viewingBillDetail.notes)}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Could not load this bill.</p>
          )}
        </Modal>

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
