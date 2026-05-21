import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { flushSync } from 'react-dom';
import { accountingApi, procurementApi, procurementDemandApi, shopApi } from '../../../services/shopApi';
import {
  filterPayFromChartAccounts,
  formatPayFromAccountLabel,
  paymentMethodForPayFromAccount,
  pickDefaultPayFromAccountId,
  type PayFromAccountOption,
} from '../../../utils/payFromAccounts';
import { notifyShopInventoryChanged } from '../../../utils/shopInventoryEvents';
import { createPurchaseBillOfflineFirst, recordSupplierPaymentOfflineFirst, setProcurementCache } from '../../../services/procurementSyncService';
import { getProcurementCache, getTenantId } from '../../../services/procurementOfflineCache';
import { useAppContext } from '../../../context/AppContext';
import { useInventory } from '../../../context/InventoryContext';
import Button from '../../ui/Button';
import { CURRENCY } from '../../../constants';
import {
  Pencil,
  Trash2,
  Wallet,
  Eye,
  Share2,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Sparkles,
  FolderTree,
} from 'lucide-react';
import {
  generatePurchaseOrderPdfBlob,
  sharePurchaseOrderPdfToWhatsApp,
  openWhatsAppTextMessage,
  normalizeWhatsAppPhone,
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
import { SupplierPaymentEditDialog, SupplierPaymentDeleteDialog } from './supplierPaymentRecordDialogs';

function newLineId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Money from API/UI (string, number, snake or camel); commas stripped; NaN → 0. */
function parseMoney(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Prefer a finite value from `primary` (e.g. inventory row); otherwise parseMoney(fallback).
 * Avoids losing catalog prices when stock payload has NaN or missing fields.
 */
function coalesceMoney(primary: unknown, fallback: unknown): number {
  if (primary !== null && primary !== undefined && primary !== '') {
    const n = typeof primary === 'number' ? primary : parseFloat(String(primary).replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return parseMoney(fallback);
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

/** Push line cost/retail to shop_products (last line wins if the same SKU appears twice). */
async function flushSkuPricesToProducts(items: LineItem[]): Promise<void> {
  const seen = new Map<string, { unitCost: number; retailPrice: number }>();
  for (const i of items) {
    seen.set(i.productId, { unitCost: i.unitCost, retailPrice: i.retailPrice });
  }
  for (const [productId, prices] of seen) {
    await shopApi.updateProduct(productId, {
      cost_price: prices.unitCost,
      retail_price: prices.retailPrice,
    });
  }
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

const LEDGER_DEFAULT_COL_WIDTHS = [140, 220, 112, 168, 120, 104, 168];

const MIN_LEDGER_COL_WIDTH = 48;

type LedgerSortColumn = 'reference' | 'vendor' | 'issueDate' | 'dueOrApplied' | 'amount' | 'status' | 'actions';

type LedgerTypeFilter = 'all' | 'bills' | 'payments';

const LEDGER_TABLE_COLUMNS: { key: LedgerSortColumn; label: string; headerAlign?: 'right' }[] = [
  { key: 'reference', label: 'Reference' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'issueDate', label: 'Issue / paid on' },
  { key: 'dueOrApplied', label: 'Due / applied to' },
  { key: 'amount', label: 'Amount', headerAlign: 'right' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions', headerAlign: 'right' },
];

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

type PurchaseLedgerRow = { kind: 'bill'; item: any } | { kind: 'payment'; item: any };

/** Numeric timestamp for reliable newest-first / oldest-first sorting. */
function rowDateSortTime(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  const d = new Date(String(raw));
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

function rowCreatedSortTime(row: PurchaseLedgerRow): number {
  const raw =
    row.kind === 'bill'
      ? row.item.created_at ?? row.item.createdAt ?? row.item.bill_date ?? row.item.billDate
      : row.item.created_at ?? row.item.createdAt ?? row.item.payment_date ?? row.item.paymentDate;
  return rowDateSortTime(raw);
}

const LEDGER_DATE_SORT_COLUMNS: LedgerSortColumn[] = ['issueDate', 'dueOrApplied'];

function getProcurementRowStatus(b: { is_posted?: unknown; status?: unknown }): ProcurementRowStatus {
  const posted = b.is_posted !== false && b.is_posted !== 0;
  const st = String(b.status ?? '').trim();
  if (!posted) return 'AWAITING';
  if (st === 'Paid') return 'PAID';
  if (st === 'Partial') return 'AWAITING';
  return 'POSTED';
}

function ledgerRowSortValues(
  row: PurchaseLedgerRow,
  vendorById: Map<string, VendorOption>
): Record<LedgerSortColumn, string | number> {
  if (row.kind === 'bill') {
    const b = row.item;
    const sid = String(b.supplier_id ?? b.supplierId ?? '');
    const v = sid ? vendorById.get(sid) : undefined;
    const vendorTitle = String(v?.company_name || v?.companyName || b.supplier_name || '—').trim();
    const billNum = String(b.bill_number ?? b.billNumber ?? '').toLowerCase();
    return {
      reference: billNum || String(b.id ?? ''),
      vendor: vendorTitle.toLowerCase(),
      issueDate: rowDateSortTime(b.bill_date ?? b.billDate),
      dueOrApplied: rowDateSortTime(b.due_date ?? b.dueDate),
      amount: Number(b.total_amount ?? b.totalAmount ?? 0),
      status: getProcurementRowStatus(b),
      actions: `bill:${String(b.id ?? '')}`,
    };
  }
  const p = row.item;
  const psid = String(p.supplier_id ?? '');
  const pv = psid ? vendorById.get(psid) : undefined;
  const pVendorTitle = String(pv?.company_name || pv?.companyName || p.supplier_name || '—').trim();
  const refLabel = (String(p.reference ?? '').trim() || String(p.id ?? '').slice(0, 10)).toLowerCase();
  return {
    reference: refLabel,
    vendor: pVendorTitle.toLowerCase(),
    issueDate: rowDateSortTime(p.payment_date ?? p.paymentDate),
    dueOrApplied: String(p.allocated_bill_numbers ?? '').toLowerCase(),
    amount: Number(p.amount) || 0,
    status: 'payment',
    actions: `payment:${String(p.id ?? '')}`,
  };
}

function compareLedgerRows(
  a: PurchaseLedgerRow,
  b: PurchaseLedgerRow,
  col: LedgerSortColumn,
  dir: 'asc' | 'desc',
  vendorById: Map<string, VendorOption>
): number {
  const va = ledgerRowSortValues(a, vendorById);
  const vb = ledgerRowSortValues(b, vendorById);
  const mult = dir === 'asc' ? 1 : -1;
  const av = va[col];
  const bv = vb[col];
  let cmp = 0;
  if (typeof av === 'number' && typeof bv === 'number') {
    cmp = av === bv ? 0 : av < bv ? -1 : 1;
  } else {
    cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true });
  }
  if (cmp !== 0) return cmp * mult;
  const ta = rowCreatedSortTime(a);
  const tb = rowCreatedSortTime(b);
  if (ta !== tb) return (ta < tb ? -1 : 1) * mult;
  const ida = String(a.kind === 'bill' ? a.item.id : a.item.id);
  const idb = String(b.kind === 'bill' ? b.item.id : b.item.id);
  return ida.localeCompare(idb) * mult;
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

type QuickPayShareInfo = {
  synced: boolean;
  paymentId?: string;
  localId?: string;
  supplierId: string;
  billId: string;
  billNumber: string;
  vendorName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: 'Bank' | 'Cash';
  bankLabel?: string;
  reference: string;
  notes: string;
};

/** Match UUID-shaped strings so we don't put internal DB ids in vendor-facing WhatsApp text. */
function isUuidString(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

function paymentConfirmationDisplayDate(ymd: string): string {
  const t = String(ymd ?? '').trim().slice(0, 10);
  if (!t) return '—';
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Mobile / WhatsApp from vendor master row (Shop → vendors API). */
function vendorRecordContactPhone(raw: Record<string, unknown> | undefined | null): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const keys = ['contact_no', 'contactNo', 'phone', 'mobile', 'whatsapp', 'whatsapp_no', 'whatsappNo'] as const;
  for (const k of keys) {
    const val = raw[k];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return undefined;
}

function resolveVendorWhatsAppPhone(supplierId: string, vendorsFromApi: any[]): string | undefined {
  if (!supplierId) return undefined;
  const row = vendorsFromApi.find((x: any) => String(x?.id) === supplierId);
  return vendorRecordContactPhone(row as Record<string, unknown>);
}

/**
 * Pre-written confirmation sent to the vendor’s configured WhatsApp / mobile number.
 */
function buildSupplierPaymentConfirmationMessage(opts: {
  vendorName: string;
  currency: string;
  amount: number;
  paymentDateYmd: string;
  paymentMethod: string;
  bankLabel?: string;
  reference?: string;
  appliedToBills?: string;
  notes?: string;
  shopName?: string;
  pendingOfflineNote?: boolean;
  localSyncRef?: string;
  externalPaymentRef?: string;
}): string {
  const vendor = String(opts.vendorName || 'Supplier').trim();
  const amountStr = opts.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateStr = paymentConfirmationDisplayDate(opts.paymentDateYmd);
  const methodLine = `${opts.paymentMethod}${opts.bankLabel ? ` — ${opts.bankLabel}` : ''}`.trim();

  const lines: string[] = [
    '*Payment confirmation*',
    '',
    `Dear ${vendor},`,
    '',
    'We confirm the following supplier payment has been recorded on our side:',
    '',
    `• Amount: ${opts.currency} ${amountStr}`,
    `• Payment date: ${dateStr}`,
    `• Method: ${methodLine || '—'}`,
  ];

  if (opts.reference?.trim()) lines.push(`• Our reference: ${opts.reference.trim()}`);
  if (opts.appliedToBills?.trim()) lines.push(`• Applied to: ${opts.appliedToBills.trim()}`);
  if (opts.notes?.trim()) lines.push(`• Notes: ${opts.notes.trim()}`);
  if (opts.externalPaymentRef?.trim()) lines.push(`• Payment ref: ${opts.externalPaymentRef.trim()}`);

  lines.push('', 'Please let us know if this does not match your records.');

  const shop = String(opts.shopName ?? '').trim();
  lines.push('', shop ? `Kind regards,\n${shop}` : 'Kind regards');

  if (opts.pendingOfflineNote) {
    lines.push(
      '',
      '_Note: This payment was saved on our device first; if you do not see it in your system yet, it should appear once our records have fully synced._'
    );
  }
  if (opts.localSyncRef?.trim()) {
    lines.push('', `Pending sync ref: ${opts.localSyncRef.trim()}`);
  }

  return lines.join('\n');
}

function openSupplierPaymentConfirmationWhatsApp(message: string, phoneRaw: string | undefined): void {
  if (!normalizeWhatsAppPhone(phoneRaw)) {
    showProcurementToast(
      'This vendor has no valid mobile or WhatsApp number on file. Add one in the vendor directory, then try again.',
      'error'
    );
    return;
  }
  openWhatsAppTextMessage(message, phoneRaw);
}

interface PurchaseBillsSectionProps {}

const PurchaseBillsSection = forwardRef<PurchaseBillsSectionHandle, PurchaseBillsSectionProps>(
  function PurchaseBillsSection(_props, ref) {
    const { state: appState, dispatch: appDispatch } = useAppContext();
    const inventory = useInventory();
    const [bills, setBills] = useState<any[]>([]);
    const [vendorsFromApi, setVendorsFromApi] = useState<any[]>([]);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [chartAccountsRaw, setChartAccountsRaw] = useState<any[]>([]);
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
      chartAccountId: '',
      notes: '',
    });
    const [productSearch, setProductSearch] = useState('');
    const [productDropdownOpen, setProductDropdownOpen] = useState(false);
    const productSearchRef = useRef<HTMLDivElement>(null);
    const procurementProductSearchInputRef = useRef<HTMLInputElement>(null);
    const procurementWedgePrevTsRef = useRef(0);
    const procurementWedgeChainRef = useRef(false);
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
    const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
    const [selectedVendorFilterId, setSelectedVendorFilterId] = useState<string | null>(null);
    const [vendorTreeSearch, setVendorTreeSearch] = useState('');
    const [vendorTreeSort, setVendorTreeSort] = useState<{ col: 'name' | 'ap'; dir: 'asc' | 'desc' }>({
      col: 'name',
      dir: 'asc',
    });
    const [editSupplierPaymentId, setEditSupplierPaymentId] = useState<string | null>(null);
    const [deleteSupplierPaymentId, setDeleteSupplierPaymentId] = useState<string | null>(null);
    const [quickPayBill, setQuickPayBill] = useState<any | null>(null);
    const [quickPayForm, setQuickPayForm] = useState({
      amount: 0,
      paymentDate: '',
      chartAccountId: '',
      notes: '',
    });
    const [quickPaySuccess, setQuickPaySuccess] = useState<QuickPayShareInfo | null>(null);
    const [quickPayPaying, setQuickPayPaying] = useState(false);
    const [autoBillMode, setAutoBillMode] = useState(false);
    const [autoBillCoverDays, setAutoBillCoverDays] = useState(10);
    const [autoBillLoading, setAutoBillLoading] = useState(false);
    const [ledgerTypeFilter, setLedgerTypeFilter] = useState<LedgerTypeFilter>('all');
    const [ledgerSort, setLedgerSort] = useState<{ col: LedgerSortColumn; dir: 'asc' | 'desc' }>({
      col: 'issueDate',
      dir: 'desc',
    });
    const [ledgerColWidths, setLedgerColWidths] = useState<number[]>(() => [...LEDGER_DEFAULT_COL_WIDTHS]);
    const ledgerColWidthsRef = useRef(ledgerColWidths);
    ledgerColWidthsRef.current = ledgerColWidths;

    const vendors: VendorOption[] = (vendorsFromApi.length > 0 ? vendorsFromApi : appState.vendors || []) as VendorOption[];

    const vendorById = useMemo(() => {
      const m = new Map<string, VendorOption>();
      for (const v of vendors) {
        if (v?.id) m.set(v.id, v);
      }
      return m;
    }, [vendors]);

    const payFromAccounts: PayFromAccountOption[] = useMemo(() => {
      const linkedChartIds = bankAccounts
        .map((b: { chart_account_id?: string; chartAccountId?: string }) => b.chart_account_id ?? b.chartAccountId)
        .filter(Boolean) as string[];
      return filterPayFromChartAccounts(chartAccountsRaw, linkedChartIds);
    }, [chartAccountsRaw, bankAccounts]);

    const payFromAccountById = useMemo(() => {
      const m = new Map<string, PayFromAccountOption>();
      for (const a of payFromAccounts) m.set(a.id, a);
      return m;
    }, [payFromAccounts]);

    const sortedBills = useMemo(() => {
      return [...bills].sort((a, b) => {
        const ad = rowDateSortTime(a.bill_date ?? a.billDate);
        const bd = rowDateSortTime(b.bill_date ?? b.billDate);
        if (bd !== ad) return bd - ad;
        const ac = rowDateSortTime(a.created_at ?? a.createdAt);
        const bc = rowDateSortTime(b.created_at ?? b.createdAt);
        if (bc !== ac) return bc - ac;
        return String(b.id ?? '').localeCompare(String(a.id ?? ''));
      });
    }, [bills]);

    const accountsPayableByVendorId = useMemo(() => {
      const m = new Map<string, number>();
      for (const b of bills) {
        const sid = String(b.supplier_id ?? b.supplierId ?? '');
        if (!sid) continue;
        const bal = Number(b.balance_due) || 0;
        if (bal <= 0) continue;
        m.set(sid, (m.get(sid) || 0) + bal);
      }
      return m;
    }, [bills]);

    const vendorTreeEntries = useMemo(() => {
      return [...vendors]
        .filter((v) => v?.id)
        .map((v) => ({
          id: v.id as string,
          name: String(v.name || v.company_name || v.companyName || 'Vendor').trim() || 'Vendor',
          ap: accountsPayableByVendorId.get(v.id as string) || 0,
        }));
    }, [vendors, accountsPayableByVendorId]);

    const filteredVendorTreeEntries = useMemo(() => {
      const q = vendorTreeSearch.trim().toLowerCase();
      if (!q) return vendorTreeEntries;
      return vendorTreeEntries.filter((e) => e.name.toLowerCase().includes(q));
    }, [vendorTreeEntries, vendorTreeSearch]);

    const displayedVendorTreeEntries = useMemo(() => {
      const rows = [...filteredVendorTreeEntries];
      const mult = vendorTreeSort.dir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        if (vendorTreeSort.col === 'name') {
          const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
          if (cmp !== 0) return cmp * mult;
          return (a.ap === b.ap ? 0 : a.ap < b.ap ? -1 : 1) * mult;
        }
        const cmpAp = a.ap === b.ap ? 0 : a.ap < b.ap ? -1 : 1;
        if (cmpAp !== 0) return cmpAp * mult;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) * mult;
      });
      return rows;
    }, [filteredVendorTreeEntries, vendorTreeSort]);

    const toggleVendorTreeSort = useCallback((col: 'name' | 'ap') => {
      setVendorTreeSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));
    }, []);

    const ledgerRowsMerged = useMemo(() => {
      const sid = selectedVendorFilterId;
      const rows: PurchaseLedgerRow[] = [];
      for (const b of sortedBills) {
        if (sid && String(b.supplier_id ?? b.supplierId ?? '') !== sid) continue;
        rows.push({ kind: 'bill', item: b });
      }
      for (const p of supplierPayments) {
        if (sid && String(p.supplier_id ?? '') !== sid) continue;
        rows.push({ kind: 'payment', item: p });
      }
      return rows;
    }, [sortedBills, supplierPayments, selectedVendorFilterId]);

    const filteredSortedLedgerRows = useMemo(() => {
      let rows = ledgerRowsMerged;
      if (ledgerTypeFilter === 'bills') rows = rows.filter((r) => r.kind === 'bill');
      else if (ledgerTypeFilter === 'payments') rows = rows.filter((r) => r.kind === 'payment');
      return [...rows].sort((a, b) => compareLedgerRows(a, b, ledgerSort.col, ledgerSort.dir, vendorById));
    }, [ledgerRowsMerged, ledgerTypeFilter, ledgerSort, vendorById]);

    const toggleLedgerSort = useCallback((col: LedgerSortColumn) => {
      setLedgerSort((s) => {
        if (s.col === col) return { col, dir: s.dir === 'asc' ? 'desc' : 'asc' };
        return { col, dir: LEDGER_DATE_SORT_COLUMNS.includes(col) ? 'desc' : 'asc' };
      });
      setBillListPage(1);
    }, []);

    const beginLedgerColumnResize = useCallback((colIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const snapshot = [...ledgerColWidthsRef.current];
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const next = [...snapshot];
        next[colIndex] = Math.max(MIN_LEDGER_COL_WIDTH, snapshot[colIndex] + dx);
        setLedgerColWidths(next);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }, []);

    const ledgerPaginationEnabled = selectedVendorFilterId == null;
    const billTotalPages = ledgerPaginationEnabled
      ? Math.max(1, Math.ceil(filteredSortedLedgerRows.length / BILL_LIST_PAGE_SIZE))
      : 1;
    const billSafePage = ledgerPaginationEnabled ? Math.min(billListPage, billTotalPages) : 1;
    const displayLedgerRows = ledgerPaginationEnabled
      ? filteredSortedLedgerRows.slice((billSafePage - 1) * BILL_LIST_PAGE_SIZE, billSafePage * BILL_LIST_PAGE_SIZE)
      : filteredSortedLedgerRows;

    const selectedVendorLedgerSummary = useMemo(() => {
      if (!selectedVendorFilterId) return null;
      let billCount = 0;
      let billsTotalGross = 0;
      let billsBalanceDue = 0;
      let paymentCount = 0;
      let paymentsTotal = 0;
      for (const r of ledgerRowsMerged) {
        if (r.kind === 'bill') {
          billCount += 1;
          const b = r.item;
          billsTotalGross += Number(b.total_amount ?? b.totalAmount ?? 0) || 0;
          billsBalanceDue += Number(b.balance_due) || 0;
        } else {
          paymentCount += 1;
          paymentsTotal += Number(r.item.amount) || 0;
        }
      }
      const vo = vendorById.get(selectedVendorFilterId);
      const vendorLabel = String(vo?.company_name || vo?.companyName || vo?.name || 'Vendor').trim() || 'Vendor';
      return {
        vendorLabel,
        billCount,
        billsTotalGross,
        billsBalanceDue,
        paymentCount,
        paymentsTotal,
      };
    }, [selectedVendorFilterId, ledgerRowsMerged, vendorById]);

    const ledgerEmptyMessage =
      ledgerRowsMerged.length === 0
        ? selectedVendorFilterId
          ? 'No bills or payments for this vendor'
          : 'No purchase bills or supplier payments yet'
        : 'No rows match this filter. Try All transactions.';

    useEffect(() => {
      setBillListPage(1);
    }, [selectedVendorFilterId, bills.length, supplierPayments.length, ledgerTypeFilter, ledgerSort.col, ledgerSort.dir]);

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
        const costVal = coalesceMoney(item.costPrice, prev?.cost_price ?? prev?.costPrice ?? 0);
        const retailVal = coalesceMoney(item.retailPrice, prev?.retail_price ?? prev?.retailPrice ?? 0);
        byId.set(item.id, {
          id: item.id,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode ?? '',
          cost_price: costVal,
          costPrice: costVal,
          average_cost: prev?.average_cost,
          retail_price: retailVal,
          retailPrice: retailVal,
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
          procurementApi.getSupplierPayments(),
          shopApi.getVendors(),
          shopApi.getWarehouses(),
          shopApi.getBankAccounts(),
          accountingApi.getAccounts(),
        ])
          .then(([b, pay, v, w, ba, coa]) => {
            const billList = normalizeList(b);
            const payList = normalizeList<{
              id?: string;
              payment_date?: string;
              paymentDate?: string;
            }>(pay).sort((a, b) => {
              const ad = rowDateSortTime(a.payment_date ?? a.paymentDate);
              const bd = rowDateSortTime(b.payment_date ?? b.paymentDate);
              if (bd !== ad) return bd - ad;
              return String(b.id ?? '').localeCompare(String(a.id ?? ''));
            });
            setBills(billList);
            setSupplierPayments(payList);
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
            setChartAccountsRaw(normalizeList(coa));
            setProcurementCache(tenantId, { purchaseBills: billList, supplierPayments: payList }).catch(() => {});
          })
          .catch(() => {
            if (tenantId) {
              getProcurementCache(tenantId)
                .then((c) => {
                  if (c?.data?.purchaseBills?.length) setBills(c.data.purchaseBills);
                  if (c?.data?.supplierPayments?.length) setSupplierPayments(c.data.supplierPayments);
                })
                .catch(() => {});
            }
            setBills([]);
            setSupplierPayments([]);
            setVendorsFromApi([]);
            setBankAccounts([]);
            setChartAccountsRaw([]);
          })
          .finally(() => setLoadingData(false));
        return;
      }

      if (tenantId) {
        getProcurementCache(tenantId)
          .then((c) => {
            if (c?.data?.purchaseBills?.length) setBills(c.data.purchaseBills);
            if (c?.data?.supplierPayments?.length) setSupplierPayments(c.data.supplierPayments);
          })
          .catch(() => setBills([]))
          .finally(() => setLoadingData(false));
        Promise.all([
          shopApi.getVendors(),
          shopApi.getWarehouses(),
          shopApi.getBankAccounts(),
          accountingApi.getAccounts(),
        ])
          .then(([v, w, ba, coa]) => {
            setVendorsFromApi(normalizeList(v));
            setBankAccounts(normalizeList(ba));
            setChartAccountsRaw(normalizeList(coa));
          })
          .catch(() => {});
        return;
      }

      setLoadingData(false);
    }, [appDispatch]);

    const openQuickPay = useCallback(
      (b: any) => {
        if (!purchaseBillCanPay(b)) return;
        const bal = Number(b.balance_due) || 0;
        if (bal <= 0) return;
        const billDate =
          String(b.bill_date ?? b.billDate ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
        setQuickPayBill(b);
        setQuickPaySuccess(null);
        setQuickPayForm({
          amount: Math.round(bal * 100) / 100,
          paymentDate: billDate,
          chartAccountId: pickDefaultPayFromAccountId(payFromAccounts),
          notes: '',
        });
      },
      [payFromAccounts]
    );

    const closeQuickPay = useCallback(() => {
      setQuickPayBill(null);
      setQuickPaySuccess(null);
      setQuickPayPaying(false);
    }, []);

    const submitQuickPay = useCallback(async () => {
      if (!quickPayBill) return;
      const supplierId = String(quickPayBill.supplier_id ?? quickPayBill.supplierId ?? '');
      if (!supplierId) {
        showProcurementToast('Bill has no supplier.', 'error');
        return;
      }
      const maxBal = Number(quickPayBill.balance_due) || 0;
      const amt = Math.round(Number(quickPayForm.amount) * 100) / 100;
      if (amt <= 0 || amt > maxBal + 0.001) {
        showProcurementToast(`Amount must be between 0.01 and ${maxBal.toFixed(2)}.`, 'error');
        return;
      }
      if (!quickPayForm.chartAccountId) {
        showProcurementToast('Select the account to pay from (Chart of Accounts).', 'error');
        return;
      }
      const billNum = String(quickPayBill.bill_number ?? quickPayBill.billNumber ?? '');
      const reference = `Pay-${billNum || quickPayBill.id}`;
      const vopt = vendors.find((v) => v.id === supplierId);
      const vendorName = String(
        vopt?.company_name || vopt?.companyName || quickPayBill.supplier_name || vopt?.name || 'Supplier'
      ).trim();
      const payAcc = payFromAccountById.get(quickPayForm.chartAccountId);
      const bankLabel = payAcc != null ? formatPayFromAccountLabel(payAcc) : undefined;
      const paymentMethod = paymentMethodForPayFromAccount(payAcc?.code);

      setQuickPayPaying(true);
      try {
        const payload = {
          supplierId,
          amount: amt,
          paymentMethod,
          chartAccountId: quickPayForm.chartAccountId,
          paymentDate: quickPayForm.paymentDate,
          reference,
          notes: quickPayForm.notes.trim() || undefined,
          allocations: [{ purchaseBillId: quickPayBill.id, amount: amt }],
        };
        const result = await recordSupplierPaymentOfflineFirst(payload);
        const body = result.result as { id?: string } | undefined;
        const paymentId = result.synced && body?.id ? body.id : undefined;
        showProcurementToast(
          result.synced ? 'Payment recorded — bill updated' : 'Payment queued offline — will sync when online',
          'success'
        );
        loadBillsAndFormData();
        setQuickPaySuccess({
          synced: !!result.synced,
          paymentId,
          localId: result.localId,
          supplierId,
          billId: quickPayBill.id,
          billNumber: billNum,
          vendorName,
          amount: amt,
          paymentDate: quickPayForm.paymentDate,
          paymentMethod,
          bankLabel,
          reference,
          notes: quickPayForm.notes.trim(),
        });
      } catch (err: unknown) {
        alert(procurementHttpErr(err, 'Failed to record payment'));
      } finally {
        setQuickPayPaying(false);
      }
    }, [quickPayBill, quickPayForm, payFromAccountById, vendors, vendorsFromApi, loadBillsAndFormData]);

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

    const syncInventoryAfterStockChange = useCallback(() => {
      notifyShopInventoryChanged({ source: 'procurement' });
      void refreshItemsRef.current?.();
    }, []);

    const commitSkuPrices = useCallback(async (productId: string, unitCost: number, retailPrice: number) => {
      if (unitCost < 0 || retailPrice < 0) return;
      try {
        await shopApi.updateProduct(productId, { cost_price: unitCost, retail_price: retailPrice });
        syncInventoryAfterStockChange();
      } catch (err: unknown) {
        showProcurementToast(procurementHttpErr(err as any, 'Could not update product prices'), 'error');
      }
    }, [syncInventoryAfterStockChange]);

    useEffect(() => {
      if (showForm) {
        loadBillsAndFormData();
        syncInventoryAfterStockChange();
      }
    }, [showForm, loadBillsAndFormData, syncInventoryAfterStockChange]);

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
              retail_price: parseFloat(String(p.retail_price ?? 0)),
              retailPrice: parseFloat(String(p.retail_price ?? 0)),
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

    /** Keyboard-wedge scanners: route rapid digit/alnum bursts to Add products (timing-based; avoids line-item and notes fields). */
    useEffect(() => {
      if (!showForm || showAddVendorModal || showAddSkuModal || quickPayBill) {
        procurementWedgeChainRef.current = false;
        procurementWedgePrevTsRef.current = 0;
        return;
      }

      const ignoreClosest = (el: Element | null) => {
        if (!el) return false;
        if (el.closest('[data-procurement-barcode-ignore]')) return true;
        if (el instanceof HTMLSelectElement) return true;
        return false;
      };

      const onKeyDownCapture = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'Escape' || e.key === 'Tab') return;

        const active = document.activeElement;
        if (active instanceof HTMLInputElement && active.id === 'procurement-bill-product-search') {
          procurementWedgeChainRef.current = false;
          procurementWedgePrevTsRef.current = 0;
          return;
        }

        if (ignoreClosest(active)) {
          procurementWedgeChainRef.current = false;
          procurementWedgePrevTsRef.current = 0;
          return;
        }

        const now = performance.now();
        const prevTs = procurementWedgePrevTsRef.current;
        const gap = prevTs ? now - prevTs : 9999;
        procurementWedgePrevTsRef.current = now;

        if (gap > 280) {
          procurementWedgeChainRef.current = false;
        }

        const isDigit = /^[0-9]$/.test(e.key);
        const isBodyChar = /^[0-9A-Za-z\-_]$/.test(e.key);
        const isEnter = e.key === 'Enter';

        if (isEnter && procurementWedgeChainRef.current && gap < 130) {
          e.preventDefault();
          procurementWedgeChainRef.current = false;
          procurementWedgePrevTsRef.current = 0;
          const input = procurementProductSearchInputRef.current;
          input?.focus({ preventScroll: true });
          queueMicrotask(() => {
            input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          });
          return;
        }

        if (procurementWedgeChainRef.current && isBodyChar && gap < 100) {
          e.preventDefault();
          flushSync(() => {
            setProductSearch((q) => q + e.key);
            setProductDropdownOpen(true);
          });
          procurementProductSearchInputRef.current?.focus({ preventScroll: true });
          return;
        }

        if (!procurementWedgeChainRef.current && isDigit && gap < 65 && gap > 0) {
          e.preventDefault();
          procurementWedgeChainRef.current = true;
          const inputEl = active instanceof HTMLInputElement ? active : null;

          if (
            inputEl &&
            inputEl.type === 'text' &&
            !inputEl.readOnly &&
            inputEl.id !== 'procurement-bill-product-search' &&
            vendorDropdownRef.current?.contains(inputEl)
          ) {
            const val = inputEl.value;
            const last = val.slice(-1);
            if (/^\d$/.test(last)) {
              flushSync(() => {
                setVendorSearch(val.slice(0, -1));
                setProductSearch(last + e.key);
                setProductDropdownOpen(true);
              });
            } else {
              flushSync(() => {
                setProductSearch((q) => q + e.key);
                setProductDropdownOpen(true);
              });
            }
          } else {
            flushSync(() => {
              setProductSearch((q) => q + e.key);
              setProductDropdownOpen(true);
            });
          }
          procurementProductSearchInputRef.current?.focus({ preventScroll: true });
        }
      };

      window.addEventListener('keydown', onKeyDownCapture, true);
      return () => window.removeEventListener('keydown', onKeyDownCapture, true);
    }, [showForm, showAddVendorModal, showAddSkuModal, quickPayBill]);

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

    useEffect(() => {
      if (
        (form.paymentStatus === 'Paid' || form.paymentStatus === 'Partial') &&
        !form.chartAccountId &&
        payFromAccounts.length > 0
      ) {
        setForm((f) => ({ ...f, chartAccountId: pickDefaultPayFromAccountId(payFromAccounts) }));
      }
    }, [form.paymentStatus, form.chartAccountId, payFromAccounts]);

    const addItem = (p: ProductOption) => {
      const unitCost =
        parseMoney(p.cost_price ?? p.costPrice) ||
        parseMoney((p as ProductOption & { average_cost?: unknown }).average_cost);
      const retailPrice = parseMoney(p.retail_price ?? p.retailPrice);
      setForm((f) => ({
        ...f,
        items: [
          ...f.items,
          {
            lineId: newLineId(),
            productId: p.id,
            quantity: 1,
            unitCost,
            retailPrice,
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
        chartAccountId: pickDefaultPayFromAccountId(payFromAccounts),
        notes: '',
      });
      setVendorSearch('');
      setProductSearch('');
      setEditBillId(null);
      setEditingIsDraft(false);
      setFormErrors({});
      setAutoBillMode(false);
    }, [payFromAccounts]);

    const applyVendorAutoLines = useCallback(async (supplierId: string, coverDays: number) => {
      const sid = String(supplierId || '').trim();
      if (!sid) return;
      const days = Math.max(1, Math.min(90, Math.floor(coverDays) || 1));
      setAutoBillLoading(true);
      try {
        const [res, plist] = await Promise.all([
          procurementDemandApi.vendorAutoBill({
            supplierId: sid,
            coverDays: days,
            salesWindowDays: 30,
          }),
          shopApi.getProducts().catch(() => []),
        ]);
        const productsList = Array.isArray(plist) ? plist : [];
        const priceByProductId = new Map<string, { cost: number; retail: number }>();
        for (const p of productsList) {
          if (p == null || p.id == null) continue;
          priceByProductId.set(String(p.id), {
            cost: parseMoney((p as { cost_price?: unknown }).cost_price),
            retail: parseMoney((p as { retail_price?: unknown }).retail_price),
          });
        }
        const lines = Array.isArray(res?.lines) ? res.lines : [];
        const items: LineItem[] = lines.map((row: any) => {
          const qty = Math.max(1, Math.floor(Number(row.suggested_order_qty) || 1));
          const pid = String(row.product_id ?? row.productId ?? '').trim();
          const cat = pid ? priceByProductId.get(pid) : undefined;
          let unitCost = parseMoney(row.cost_price ?? row.unitCost ?? row.unit_cost);
          let retailPrice = parseMoney(row.retail_price ?? row.retailPrice);
          if (cat) {
            if (unitCost <= 0 && cat.cost > 0) unitCost = cat.cost;
            if (retailPrice <= 0 && cat.retail > 0) retailPrice = cat.retail;
          }
          return {
            lineId: newLineId(),
            productId: pid || String(row.product_id ?? row.productId ?? ''),
            quantity: qty,
            unitCost,
            retailPrice,
            taxAmount: 0,
            subtotal: qty * unitCost,
            expiryDate: defaultExpiryDate(),
            expiryHighlight: true,
            batchNo: '',
          };
        });
        setForm((f) => ({ ...f, items }));
        if (items.length === 0) {
          showProcurementToast(
            'No suggested quantities for this window. Try a longer horizon, or add lines manually (products need past sales and prior purchases from this vendor).',
            'info'
          );
        } else {
          showProcurementToast(`Loaded ${items.length} recommended line(s). You can edit quantities or add products.`, 'success');
        }
      } catch (err: unknown) {
        const st = (err as { status?: number }).status;
        if (st === 404) {
          alert(
            'Auto purchase bill is not available from this server (HTTP 404). The hosted API may need to be redeployed with the latest code, or your dev proxy may be misconfigured. Try: run `npm run dev` from the repo root for a local API, or fix `VITE_API_URL` in client/.env.cloud (use your API origin; trailing /api is optional).'
          );
        } else {
          alert(procurementHttpErr(err, 'Could not load recommendations'));
        }
      } finally {
        setAutoBillLoading(false);
      }
    }, []);

    const openAutoPurchaseBill = useCallback(() => {
      const sid = selectedVendorFilterId;
      if (!sid) {
        showProcurementToast('Select a vendor in the sidebar first (not “All vendors”).', 'error');
        return;
      }
      const v = vendors.find((x) => x.id === sid);
      if (!v) {
        showProcurementToast('Vendor not found. Refresh the page and try again.', 'error');
        return;
      }
      resetFormFields();
      setAutoBillMode(true);
      setForm({
        supplierId: sid,
        billNumber: `PB-${Date.now()}`,
        billDate: new Date().toISOString().slice(0, 10),
        dueDate: '',
        items: [],
        paymentStatus: 'Credit',
        paidAmount: 0,
        chartAccountId: pickDefaultPayFromAccountId(payFromAccounts),
        notes: '',
      });
      setVendorSearch(
        `${v.name}${(v.company_name ?? v.companyName) ? ` (${v.company_name ?? v.companyName})` : ''}`
      );
      setProductSearch('');
      setShowForm(true);
      const days = Math.max(1, Math.min(90, Math.floor(autoBillCoverDays) || 1));
      void applyVendorAutoLines(sid, days);
    }, [selectedVendorFilterId, vendors, resetFormFields, applyVendorAutoLines, autoBillCoverDays]);

    const closeForm = useCallback(() => {
      resetFormFields();
      setShowForm(false);
    }, [resetFormFields]);

    const openNewPurchaseBillForm = useCallback(() => {
      resetFormFields();
      setShowForm(true);
    }, [resetFormFields]);

    useImperativeHandle(
      ref,
      () => ({
        openNewPurchaseBill: openNewPurchaseBillForm,
      }),
      [openNewPurchaseBillForm]
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
        if ((row.retailPrice ?? 0) < 0) {
          alert('Retail price cannot be negative.');
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
        if (form.items.length > 0) {
          try {
            await flushSkuPricesToProducts(form.items);
            syncInventoryAfterStockChange();
          } catch (err: unknown) {
            alert(procurementHttpErr(err as any, 'Could not update product prices'));
            return;
          }
        }
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
        syncInventoryAfterStockChange();
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
        if ((row.retailPrice ?? 0) < 0) {
          alert('Retail price cannot be negative.');
          return;
        }
      }
      setLoading(true);
      try {
        if (form.items.length > 0) {
          try {
            await flushSkuPricesToProducts(form.items);
            syncInventoryAfterStockChange();
          } catch (err: unknown) {
            alert(procurementHttpErr(err as any, 'Could not update product prices'));
            return;
          }
        }
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
      if (
        (form.paymentStatus === 'Paid' || form.paymentStatus === 'Partial') &&
        (!form.chartAccountId || payFromAccounts.length === 0)
      ) {
        alert('Select a Pay from account from Chart of Accounts (Settings → Chart of Accounts).');
        return;
      }
      setLoading(true);
      try {
        if (form.items.length > 0) {
          try {
            await flushSkuPricesToProducts(form.items);
            syncInventoryAfterStockChange();
          } catch (err: unknown) {
            alert(procurementHttpErr(err as any, 'Could not update product prices'));
            return;
          }
        }
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
          chartAccountId: form.chartAccountId || undefined,
          notes: form.notes || undefined,
        };

        if (editBillId && editingIsDraft) {
          await procurementApi.postPurchaseBill(editBillId, payload);
          closeForm();
          const paidAtPost = form.paymentStatus !== 'Credit';
          showProcurementToast(
            paidAtPost ? 'Purchase bill posted — payment recorded' : 'Purchase bill posted — stock updated',
            'success'
          );
          loadBillsAndFormData();
          syncInventoryAfterStockChange();
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
          const paidAtPost = form.paymentStatus !== 'Credit';
          showProcurementToast(
            paidAtPost ? 'Purchase bill posted — payment recorded' : 'Purchase bill saved',
            'success'
          );
          setSharePdfToWhatsAppAfterSave(false);
          loadBillsAndFormData();
          syncInventoryAfterStockChange();
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
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Modal
          isOpen={showForm}
          onClose={() => {
            if (!loading) closeForm();
          }}
          title={
            editBillId
              ? editingIsDraft
                ? 'Edit draft purchase bill'
                : 'Edit purchase bill'
              : autoBillMode
                ? 'Create purchase bill (suggested lines)'
                : 'Create purchase bill'
          }
          size="full"
          disableScroll
          className="!mx-0 h-[calc(100dvh-0.5rem)] min-h-0 w-full !max-h-[calc(100dvh-0.5rem)] !max-w-none sm:!mx-auto sm:h-[calc(100dvh-1rem)] sm:!max-h-[calc(100dvh-1rem)] sm:!max-w-[min(100vw-0.5rem,min(92rem,100vw))]"
        >
          <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3 md:p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editBillId && !editingIsDraft) {
                  void handleUpdatePostedBill();
                }
              }}
              className="flex min-h-0 flex-1 flex-col gap-1.5"
            >
              {autoBillMode && !editBillId && (
                <div
                  className="shrink-0 rounded-lg border border-amber-200/80 bg-amber-50/40 px-2.5 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/25"
                  role="region"
                  aria-label="Smart purchase suggestions"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-semibold text-foreground sm:text-sm">Suggested lines</span>
                    <label
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground sm:text-sm"
                      data-procurement-barcode-ignore
                    >
                      Next
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={autoBillCoverDays}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setAutoBillCoverDays(Number.isFinite(n) ? Math.max(1, Math.min(90, n)) : 1);
                        }}
                        className="input input-text w-14 py-0.5 text-center text-xs font-semibold tabular-nums sm:w-16 sm:text-sm"
                        disabled={autoBillLoading}
                        aria-label="Days of demand to cover from sales trend"
                      />
                      days
                    </label>
                    <button
                      type="button"
                      disabled={autoBillLoading || !form.supplierId}
                      onClick={() => {
                        const d = Math.max(1, Math.min(90, Math.floor(autoBillCoverDays) || 1));
                        void applyVendorAutoLines(form.supplierId, d);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50 sm:px-2.5 sm:text-xs"
                    >
                      {autoBillLoading ? 'Computing…' : 'Refresh'}
                    </button>
                  </div>
                  <details className="mt-1 border-t border-amber-200/50 pt-1 dark:border-amber-900/40">
                    <summary className="cursor-pointer list-none text-[11px] text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden hover:text-foreground">
                      How quantities are calculated
                    </summary>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      Products are limited to items on past bills from this vendor. Quantities use a 30-day sales average: suggested order ≈ max(0, daily sales × days minus current stock). Adjust lines or add products as needed.
                    </p>
                  </details>
                </div>
              )}
              <div className="grid shrink-0 grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 xl:grid-cols-4 xl:items-end">
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
                      if (autoBillMode && !editBillId) {
                        const d = Math.max(1, Math.min(90, Math.floor(autoBillCoverDays) || 1));
                        void applyVendorAutoLines(v.id, d);
                      }
                    }}
                    onAddSupplier={() => setShowAddVendorModal(true)}
                  />
                  {formErrors.supplier && <p className="mt-1 text-xs font-medium text-destructive">{formErrors.supplier}</p>}
                </div>
                <div data-procurement-barcode-ignore>
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
                <div data-procurement-barcode-ignore>
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
                  hideCatalogHint
                  inputRef={procurementProductSearchInputRef}
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
                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain [scrollbar-gutter:stable]">
                    <table className="table-modern min-w-[1160px]">
                      <thead className="sticky top-0 z-10 hidden border-b border-border bg-card shadow-erp md:table-header-group">
                        <tr>
                          <th className="table-header w-12 whitespace-nowrap text-center" title="Serial number">
                            S.No
                          </th>
                          <th className="table-header whitespace-nowrap">Product name</th>
                          <th className="table-header whitespace-nowrap">Stock</th>
                          <th className="table-header whitespace-nowrap">Quantity</th>
                          <th className="table-header whitespace-nowrap text-right">Unit cost</th>
                          <th className="table-header whitespace-nowrap text-right">Retail price</th>
                          <th
                            className="table-header whitespace-nowrap text-right"
                            title="Gross margin on retail: (retail price − unit cost) ÷ retail price"
                          >
                            Profit margin
                          </th>
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
                              onRetailPriceChange={(rp) => updateItem(i.lineId, 'retailPrice', rp)}
                              onSkuPricesCommit={(productId, unitCost, retailPrice) => {
                                void commitSkuPrices(productId, unitCost, retailPrice);
                              }}
                              onExpiryChange={(d) => updateItem(i.lineId, 'expiryDate', d)}
                              onBatchNoChange={(b) => updateItem(i.lineId, 'batchNo', b)}
                              onRemove={() => removeItem(i.lineId)}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="shrink-0 border-t border-border px-3 py-2.5 sm:p-4">
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
                    chartAccountId={form.chartAccountId}
                    onChartAccountChange={(id) => setForm((f) => ({ ...f, chartAccountId: id }))}
                    payFromAccounts={payFromAccounts}
                  />
                </div>
              )}

              <details className="group shrink-0 rounded-lg border border-border bg-muted open:bg-card">
                <summary className="cursor-pointer list-none px-2.5 py-1.5 text-sm font-semibold text-foreground">
                  <span className="text-muted-foreground">Notes</span>
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(optional — click to expand)</span>
                </summary>
                <div className="border-t border-border px-2.5 pb-2 pt-1.5" data-procurement-barcode-ignore>
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

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:min-h-[calc(100dvh-12rem)] lg:flex-row lg:items-stretch">
          <aside className="flex w-full shrink-0 flex-col lg:w-80 lg:min-w-[20rem] xl:w-96">
            <div className="card flex max-h-[min(52dvh,520px)] min-h-[280px] flex-1 flex-col overflow-hidden p-0 shadow-sm lg:h-full lg:max-h-none lg:min-h-0">
              <div className="shrink-0 border-b border-border bg-muted/30 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <FolderTree className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Vendors</h2>
                    <p className="truncate text-[10px] text-muted-foreground">Accounts payable by vendor</p>
                    <label htmlFor="vendor-tree-search" className="sr-only">
                      Search vendors
                    </label>
                    <input
                      id="vendor-tree-search"
                      type="search"
                      autoComplete="off"
                      placeholder="Search vendors…"
                      value={vendorTreeSearch}
                      onChange={(e) => setVendorTreeSearch(e.target.value)}
                      className="input input-text mt-2 h-9 w-full rounded-lg py-1.5 text-sm placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                <div
                  className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-card px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  role="row"
                >
                  <button
                    type="button"
                    onClick={() => toggleVendorTreeSort('name')}
                    className={`flex min-w-0 items-center gap-0.5 text-left font-bold uppercase tracking-wider transition-colors hover:text-foreground ${
                      vendorTreeSort.col === 'name' ? 'text-foreground' : ''
                    }`}
                    aria-label={
                      vendorTreeSort.col === 'name'
                        ? `Vendor sorted ${vendorTreeSort.dir === 'asc' ? 'A–Z' : 'Z–A'}`
                        : 'Sort by vendor name'
                    }
                  >
                    <span className="truncate">Vendor</span>
                    {vendorTreeSort.col === 'name' &&
                      (vendorTreeSort.dir === 'asc' ? (
                        <ChevronUp className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                      ))}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleVendorTreeSort('ap')}
                    className={`flex shrink-0 items-center justify-end gap-0.5 whitespace-nowrap text-right font-bold uppercase tracking-wider transition-colors hover:text-foreground ${
                      vendorTreeSort.col === 'ap' ? 'text-foreground' : ''
                    }`}
                    aria-label={
                      vendorTreeSort.col === 'ap'
                        ? `Amount due sorted ${vendorTreeSort.dir === 'asc' ? 'low to high' : 'high to low'}`
                        : 'Sort by amount due'
                    }
                  >
                    <span>Amount due</span>
                    {vendorTreeSort.col === 'ap' &&
                      (vendorTreeSort.dir === 'asc' ? (
                        <ChevronUp className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                      ))}
                  </button>
                </div>
                <div className="space-y-0.5 p-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedVendorFilterId(null)}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                      selectedVendorFilterId == null
                        ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                        : 'border-transparent hover:bg-muted/80'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-semibold">All vendors</span>
                      <span className="block truncate text-[10px] text-muted-foreground">Every bill and payment</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">—</span>
                  </button>
                  <ul className="space-y-0.5" aria-label="Filter by vendor and open balance">
                    {displayedVendorTreeEntries.map((entry) => {
                      const selected = selectedVendorFilterId === entry.id;
                      const apStr = `${CURRENCY} ${entry.ap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedVendorFilterId(entry.id)}
                            className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                              selected
                                ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                                : 'border-transparent hover:bg-muted/80'
                            }`}
                          >
                            <span className="min-w-0 truncate text-sm font-semibold">{entry.name}</span>
                            <span
                              className={`shrink-0 text-xs font-semibold tabular-nums ${entry.ap > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                              title={apStr}
                            >
                              {apStr}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {!loadingData && vendorTreeEntries.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-muted-foreground">No vendors in directory yet</p>
                  )}
                  {!loadingData && vendorTreeEntries.length > 0 && filteredVendorTreeEntries.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-muted-foreground">No vendors match your search</p>
                  )}
                </div>
              </div>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="card flex min-h-[min(48dvh,360px)] flex-1 flex-col overflow-hidden p-0 shadow-sm lg:min-h-0">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Purchase ledger
                  </span>
                  <div
                    className="inline-flex rounded-lg border border-border bg-background p-0.5 shadow-sm"
                    role="group"
                    aria-label="Filter by transaction type"
                  >
                    {(
                      [
                        { id: 'all' as const, label: 'All transactions' },
                        { id: 'bills' as const, label: 'Bills' },
                        { id: 'payments' as const, label: 'Payments' },
                      ] as const
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setLedgerTypeFilter(id)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          ledgerTypeFilter === id
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button
                  type="button"
                  disabled={!selectedVendorFilterId || autoBillLoading}
                  onClick={openAutoPurchaseBill}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  title={
                    selectedVendorFilterId
                      ? 'Open a new bill with this vendor and suggested line quantities'
                      : 'Select a vendor in the sidebar first'
                  }
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
                  Auto purchase bill
                </button>
                <button
                  type="button"
                  onClick={openNewPurchaseBillForm}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#0047AB] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#003694] dark:bg-[#0047AB] dark:hover:bg-[#003694]"
                >
                  <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                  New Bill
                </button>
              </div>
            </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] table-fixed text-left">
                  <colgroup>
                    {ledgerColWidths.map((w, i) => (
                      <col key={i} style={{ width: w, minWidth: MIN_LEDGER_COL_WIDTH }} />
                    ))}
                  </colgroup>
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      {LEDGER_TABLE_COLUMNS.map(({ key, label, headerAlign }, idx) => (
                        <th key={key} className="relative p-0 align-bottom">
                          <button
                            type="button"
                            onClick={() => toggleLedgerSort(key)}
                            className={`flex w-full items-center gap-1 px-4 py-3 pr-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground ${
                              headerAlign === 'right' ? 'justify-end text-right' : 'justify-start text-left'
                            }`}
                          >
                            <span className="truncate">{label}</span>
                            {ledgerSort.col === key &&
                              (ledgerSort.dir === 'asc' ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                              ))}
                          </button>
                          <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-hidden
                            onMouseDown={(e) => beginLedgerColumnResize(idx, e)}
                            className="absolute right-0 top-0 z-10 h-full w-1.5 max-w-[6px] cursor-col-resize select-none hover:bg-primary/30 active:bg-primary/50"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingData && bills.length === 0 && supplierPayments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                          Loading purchase bills…
                        </td>
                      </tr>
                    ) : displayLedgerRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                          {ledgerEmptyMessage}
                        </td>
                      </tr>
                    ) : (
                      displayLedgerRows.map((row) => {
                        if (row.kind === 'bill') {
                          const b = row.item;
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
                            <tr key={`bill-${b.id}`} className="hover:bg-muted/30 transition-colors">
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
                                        const [bill, products] = await Promise.all([
                                          procurementApi.getPurchaseBillById(b.id),
                                          shopApi.getProducts(),
                                        ]);
                                        if (!bill) {
                                          alert('Could not load bill.');
                                          return;
                                        }
                                        const plist = Array.isArray(products) ? products : [];
                                        const retailById = new Map(
                                          plist.map((p: { id: string; retail_price?: unknown }) => [
                                            p.id,
                                            parseFloat(String(p.retail_price ?? 0)) || 0,
                                          ])
                                        );
                                        setEditingIsDraft(bill.is_posted === false || bill.is_posted === 0);
                                        setForm({
                                          supplierId: bill.supplier_id || bill.supplierId || '',
                                          billNumber: bill.bill_number || bill.billNumber || '',
                                          billDate: (bill.bill_date || bill.billDate || '').toString().slice(0, 10),
                                          dueDate: (bill.due_date || bill.dueDate || '').toString().slice(0, 10) || '',
                                          items: (bill.items || []).map((it: any) => {
                                            const pid = it.product_id || it.productId;
                                            return {
                                              lineId: newLineId(),
                                              productId: pid,
                                              quantity: Number(it.quantity) || 1,
                                              unitCost: Number(it.unit_cost ?? it.unitCost) || 0,
                                              retailPrice: retailById.get(pid) ?? 0,
                                              taxAmount: Number(it.tax_amount ?? it.taxAmount) || 0,
                                              subtotal: Number(it.subtotal) || 0,
                                              expiryDate: isoDateFromPurchaseApi(it.expiry_date ?? it.expiryDate),
                                              expiryHighlight: false,
                                              batchNo: String(it.batch_no ?? it.batchNo ?? ''),
                                            };
                                          }),
                                          paymentStatus: 'Credit',
                                          paidAmount: 0,
                                          chartAccountId: pickDefaultPayFromAccountId(payFromAccounts),
                                          notes: bill.notes || '',
                                        });
                                        setVendorSearch(bill.supplier_name || '');
                                        setEditBillId(b.id);
                                        setAutoBillMode(false);
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
                                  {purchaseBillCanPay(b) && (
                                    <button
                                      type="button"
                                      onClick={() => openQuickPay(b)}
                                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-primary transition-colors hover:bg-accent"
                                      title="Pay bill"
                                    >
                                      <Wallet className="h-4 w-4" />
                                      Pay
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        const p = row.item;
                        const psid = String(p.supplier_id ?? '');
                        const pv = psid ? vendorById.get(psid) : undefined;
                        const pVendorTitle = String(pv?.company_name || pv?.companyName || p.supplier_name || '—').trim();
                        const pVendorSub = String(p.payment_method ?? 'Payment').trim();
                        const paidOn = String(p.payment_date ?? p.paymentDate ?? '').slice(0, 10);
                        const allocBills = String(p.allocated_bill_numbers ?? '').trim();
                        const payAmt = Number(p.amount) || 0;
                        const refTrim = String(p.reference ?? '').trim();
                        const refLabel = refTrim || String(p.id ?? '').slice(0, 10);
                        const payNotes = String(p.notes ?? '').trim();
                        const payMethod = String(p.payment_method ?? '').trim();
                        const chartPayId = String(
                          p.payment_chart_account_id ?? p.paymentChartAccountId ?? ''
                        ).trim();
                        const bankLabelPay = chartPayId
                          ? formatPayFromAccountLabel(
                              payFromAccountById.get(chartPayId) ?? {
                                id: chartPayId,
                                name: String(
                                  p.payment_chart_account_name ??
                                    p.paymentChartAccountName ??
                                    'Account'
                                ),
                                code: p.payment_chart_account_code ?? p.paymentChartAccountCode,
                              }
                            )
                          : payMethod === 'Bank'
                            ? bankAccounts.find((x) => x.id === (p.bank_account_id ?? p.bankAccountId))?.name
                            : payMethod === 'Cash'
                              ? 'Cash'
                              : undefined;

                        return (
                          <tr
                            key={`pay-${p.id}`}
                            className="bg-emerald-50/35 hover:bg-emerald-50/55 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/40 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Wallet className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Bill payment</div>
                                  <div className="truncate font-mono text-[11px] text-muted-foreground">{refLabel}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rowAvatarColor(psid || p.id)}`}
                                >
                                  {vendorInitialsFromName(pVendorTitle || p.supplier_name || '?')}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-foreground">{pVendorTitle}</div>
                                  <div className="truncate text-[11px] text-muted-foreground">{pVendorSub}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{formatBillDateDisplay(paidOn)}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {allocBills ? (
                                <span title={allocBills}>
                                  Bills: <span className="font-medium text-foreground">{allocBills}</span>
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="numeric-data px-4 py-3 text-right text-sm font-bold text-emerald-700 dark:text-emerald-300">
                              {CURRENCY}{' '}
                              {payAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-block rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold uppercase text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:ring-violet-800">
                                Payment
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => setEditSupplierPaymentId(p.id)}
                                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                                  title="Edit payment"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteSupplierPaymentId(p.id)}
                                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-destructive"
                                  title="Delete payment"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const phone = resolveVendorWhatsAppPhone(psid, vendorsFromApi);
                                    const pidStr = p.id != null ? String(p.id).trim() : '';
                                    openSupplierPaymentConfirmationWhatsApp(
                                      buildSupplierPaymentConfirmationMessage({
                                        vendorName: pVendorTitle || String(p.supplier_name ?? 'Supplier').trim(),
                                        currency: CURRENCY,
                                        amount: payAmt,
                                        paymentDateYmd: paidOn,
                                        paymentMethod: payMethod || '—',
                                        bankLabel: bankLabelPay,
                                        reference: refTrim || undefined,
                                        appliedToBills: allocBills ? `Bill(s): ${allocBills}` : undefined,
                                        notes: payNotes || undefined,
                                        shopName: receiptShop.name,
                                        externalPaymentRef:
                                          pidStr && !isUuidString(pidStr) && pidStr !== refTrim ? pidStr : undefined,
                                      }),
                                      phone
                                    );
                                  }}
                                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                                  title="Send payment confirmation on WhatsApp (vendor contact)"
                                >
                                  <Share2 className="h-4 w-4" aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              </div>

              {ledgerPaginationEnabled && filteredSortedLedgerRows.length > 0 && (
                <div className="flex shrink-0 flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-muted-foreground">
                    Showing {(billSafePage - 1) * BILL_LIST_PAGE_SIZE + 1} to{' '}
                    {Math.min(billSafePage * BILL_LIST_PAGE_SIZE, filteredSortedLedgerRows.length)} of{' '}
                    {filteredSortedLedgerRows.length} entries
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
              {selectedVendorFilterId && selectedVendorLedgerSummary && (
                <div
                  className="shrink-0 border-t border-border bg-muted/35 px-3 py-2.5 dark:bg-muted/20"
                  role="status"
                  aria-label={`${selectedVendorLedgerSummary.vendorLabel} ledger summary`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-1">
                    <span className="text-xs font-bold text-foreground">
                      {selectedVendorLedgerSummary.vendorLabel}
                      <span className="ml-1.5 font-normal text-muted-foreground">— summary</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] sm:text-xs">
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground">{selectedVendorLedgerSummary.billCount}</span> bill
                        {selectedVendorLedgerSummary.billCount === 1 ? '' : 's'}
                        <span className="mx-1.5 text-border">·</span>
                        Total billed{' '}
                        <span className="whitespace-nowrap font-semibold tabular-nums text-foreground">
                          {CURRENCY}{' '}
                          {selectedVendorLedgerSummary.billsTotalGross.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span className="mx-1.5 text-border">·</span>
                        Balance due{' '}
                        <span
                          className={`whitespace-nowrap font-semibold tabular-nums ${
                            selectedVendorLedgerSummary.billsBalanceDue > 0 ? 'text-destructive' : 'text-foreground'
                          }`}
                        >
                          {CURRENCY}{' '}
                          {selectedVendorLedgerSummary.billsBalanceDue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground">{selectedVendorLedgerSummary.paymentCount}</span>{' '}
                        payment
                        {selectedVendorLedgerSummary.paymentCount === 1 ? '' : 's'}
                        <span className="mx-1.5 text-border">·</span>
                        Total paid{' '}
                        <span className="whitespace-nowrap font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {CURRENCY}{' '}
                          {selectedVendorLedgerSummary.paymentsTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
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
                      syncInventoryAfterStockChange();
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

        <Modal
          isOpen={!!quickPayBill}
          onClose={() => !quickPayPaying && closeQuickPay()}
          title={quickPaySuccess ? 'Payment recorded' : 'Pay supplier bill'}
          size="md"
        >
          {quickPayBill && !quickPaySuccess && (
            <div className="space-y-4 text-sm">
              <div>
                <span className="label mb-1 block">Vendor</span>
                <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-semibold text-foreground">
                  {(() => {
                    const sid = String(quickPayBill.supplier_id ?? quickPayBill.supplierId ?? '');
                    const v = sid ? vendorById.get(sid) : undefined;
                    return String(
                      v?.company_name || v?.companyName || quickPayBill.supplier_name || v?.name || '—'
                    ).trim();
                  })()}
                </p>
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="quick-pay-amount">
                  Amount ({CURRENCY})
                </label>
                <input
                  id="quick-pay-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Number(quickPayBill.balance_due) || 0}
                  value={quickPayForm.amount || ''}
                  onChange={(e) => setQuickPayForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                  className="input input-text w-full tabular-nums"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Balance due: {CURRENCY}{' '}
                  {Number(quickPayBill.balance_due || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="quick-pay-date">
                  Payment date
                </label>
                <input
                  id="quick-pay-date"
                  type="date"
                  value={quickPayForm.paymentDate}
                  onChange={(e) => setQuickPayForm((f) => ({ ...f, paymentDate: e.target.value }))}
                  className="input input-text w-full"
                />
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Starts from the bill issue date; change if needed.
                </p>
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="quick-pay-account">
                  Pay from
                </label>
                {payFromAccounts.length > 0 ? (
                  <>
                    <select
                      id="quick-pay-account"
                      value={quickPayForm.chartAccountId}
                      onChange={(e) => setQuickPayForm((f) => ({ ...f, chartAccountId: e.target.value }))}
                      className="input input-text w-full"
                      required
                    >
                      <option value="">Select cash or bank account…</option>
                      {payFromAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {formatPayFromAccountLabel(acc)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cash and bank accounts from Settings → Chart of Accounts.
                    </p>
                  </>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    No cash or bank accounts found. Add Asset accounts under Cash & Cash Equivalents (code 111xx) in
                    Settings → Chart of Accounts.
                  </p>
                )}
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="quick-pay-notes">
                  Notes (optional)
                </label>
                <textarea
                  id="quick-pay-notes"
                  value={quickPayForm.notes}
                  onChange={(e) => setQuickPayForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="input input-text w-full resize-y placeholder:text-muted-foreground"
                  placeholder="Memo for this payment"
                />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={quickPayPaying}
                  onClick={() => closeQuickPay()}
                  className="btn-secondary rounded-lg px-4 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    quickPayPaying || !quickPayForm.chartAccountId || payFromAccounts.length === 0
                  }
                  onClick={() => void submitQuickPay()}
                  className="btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {quickPayPaying ? 'Processing…' : 'Pay'}
                </button>
              </div>
            </div>
          )}
          {quickPaySuccess && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Payment saved and the bill has been updated. You can share the purchase bill as a PDF or send a payment
                confirmation message to the vendor on WhatsApp (uses the mobile number saved on the vendor record).
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void shareExistingBillToWhatsApp(quickPaySuccess.billId)}
                  disabled={!!sharingPdfBillId}
                  className="btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" />
                  Share bill (PDF)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const phone = resolveVendorWhatsAppPhone(quickPaySuccess.supplierId, vendorsFromApi);
                    openSupplierPaymentConfirmationWhatsApp(
                      buildSupplierPaymentConfirmationMessage({
                        vendorName: quickPaySuccess.vendorName,
                        currency: CURRENCY,
                        amount: quickPaySuccess.amount,
                        paymentDateYmd: quickPaySuccess.paymentDate,
                        paymentMethod: quickPaySuccess.paymentMethod,
                        bankLabel: quickPaySuccess.bankLabel,
                        reference: quickPaySuccess.reference,
                        appliedToBills: quickPaySuccess.billNumber ? `Bill #${quickPaySuccess.billNumber}` : undefined,
                        notes: quickPaySuccess.notes || undefined,
                        shopName: receiptShop.name,
                        pendingOfflineNote: !quickPaySuccess.synced,
                        localSyncRef: quickPaySuccess.localId,
                        externalPaymentRef:
                          quickPaySuccess.paymentId && !isUuidString(quickPaySuccess.paymentId)
                            ? quickPaySuccess.paymentId
                            : undefined,
                      }),
                      phone
                    );
                  }}
                  className="btn-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary"
                >
                  <Share2 className="h-4 w-4" />
                  Send payment confirmation (WhatsApp)
                </button>
              </div>
              <button
                type="button"
                onClick={() => closeQuickPay()}
                className="btn-secondary w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
              >
                Done
              </button>
            </div>
          )}
        </Modal>

        <SupplierPaymentEditDialog
          paymentId={editSupplierPaymentId}
          vendors={vendors as any[]}
          payFromAccounts={payFromAccounts}
          onClose={() => setEditSupplierPaymentId(null)}
          onSaved={() => {
            showProcurementToast('Payment updated', 'success');
            loadBillsAndFormData();
          }}
        />

        <SupplierPaymentDeleteDialog
          paymentId={deleteSupplierPaymentId}
          onClose={() => setDeleteSupplierPaymentId(null)}
          onDeleted={() => {
            showProcurementToast('Payment removed — bills updated', 'success');
            loadBillsAndFormData();
          }}
        />

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
