import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Download,
  Filter,
  Wallet,
  Pencil,
  Trash2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FolderTree,
  ChevronUp,
  ChevronDown,
  MessageCircle,
} from 'lucide-react';
import { khataApi, KhataLedgerEntry, KhataSummaryRow, shopApi, ShopBankAccount } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Modal from '../../ui/Modal';
import { normalizeWhatsAppPhone, openWhatsAppTextMessage } from '../../../services/procurement/purchaseOrderPdf';

const PAID_EPS = 0.009;
const DSO_CRITICAL_DAYS = 45;
const OVERDUE_AFTER_DAYS = 30;

/** Receipt # for POS lookup — from joined sale or parsed from note (e.g. "Sale SALE-…"). */
function khataEntrySaleInvoice(entry: KhataLedgerEntry): string | null {
  const sn = entry.sale_number?.trim();
  if (sn && /^SALE-/i.test(sn)) return sn;
  const note = entry.note?.trim();
  if (note) {
    const m = note.match(/SALE-\d+/i);
    if (m) return m[0];
  }
  return null;
}

function clientCode(id: string): string {
  const compact = id.replace(/-/g, '');
  const tail = compact.slice(-4).toUpperCase();
  return `CLT-${tail.padStart(4, '0')}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function daysSince(dateStr: string): number {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (86400 * 1000)));
}

function formatMoney(n: number, min = 2, max = 2): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max });
}

function rowDisplayType(entry: KhataLedgerEntry): string {
  if (entry.type === 'credit') {
    const n = (entry.note || '').toLowerCase();
    if (n.includes('credit note') || n.includes('return') || n.includes('cn-')) return 'Credit Note';
    return 'Payment';
  }
  if (entry.order_id || khataEntrySaleInvoice(entry)) return 'Invoice';
  const n = (entry.note || '').toLowerCase();
  if (n.includes('subscription')) return 'Subscription';
  if (n.includes('integration')) return 'Integration';
  return 'Invoice';
}

function referenceLabel(entry: KhataLedgerEntry): string {
  const inv = khataEntrySaleInvoice(entry);
  if (inv) return inv;
  if (entry.sale_number?.trim()) return entry.sale_number.trim();
  const id = entry.id.replace(/-/g, '');
  const short = id.slice(0, 8).toUpperCase();
  if (entry.type === 'credit') return `RCP-${short}`;
  return `INV-${short}`;
}

type StatusBadge = { label: string; className: string };

function entryStatusBadge(entry: KhataLedgerEntry, debitLineStatus: (e: KhataLedgerEntry) => 'paid' | 'partial' | 'open' | null): StatusBadge {
  if (entry.type === 'credit') {
    if ((entry.note || '').toLowerCase().includes('credit')) {
      return { label: 'APPLIED', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' };
    }
    return { label: 'SETTLED', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' };
  }
  const st = debitLineStatus(entry);
  const age = daysSince(entry.created_at);
  if (st === 'paid') {
    return { label: 'SETTLED', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' };
  }
  if (st === 'partial') {
    return { label: 'PARTIAL', className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200' };
  }
  if (age > OVERDUE_AFTER_DAYS) {
    return { label: `OVERDUE`, className: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300' };
  }
  if ((entry.note || '').toLowerCase().includes('subscription')) {
    return { label: 'ACTIVE', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300' };
  }
  return { label: 'OPEN', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
}

function buildWhatsappStatementMessage(
  customerName: string,
  closing: number,
  lines: KhataLedgerEntry[]
): string {
  const header = `*Account statement — ${customerName}*\nAs of ${new Date().toLocaleDateString()}\n*Closing balance:* ${CURRENCY} ${formatMoney(closing)}\n`;
  const body = lines
    .slice(0, 12)
    .map((e) => {
      const ref = referenceLabel(e);
      const typ = rowDisplayType(e);
      const amt = `${e.type === 'debit' ? '+' : '−'} ${CURRENCY} ${formatMoney(e.amount)}`;
      return `• ${new Date(e.created_at).toLocaleDateString()} · ${typ} · ${ref} · ${amt}`;
    })
    .join('\n');
  const more = lines.length > 12 ? `\n… +${lines.length - 12} more lines (see ledger in shop).` : '';
  return header + '\n' + body + more;
}

function buildKhataPaymentConfirmationMessage(opts: {
  customerName: string;
  amount: number;
  currency: string;
  note?: string;
  dateStr?: string;
}): string {
  const d = opts.dateStr ?? new Date().toLocaleString();
  const lines = [
    `*Payment received — thank you*`,
    '',
    `Dear ${opts.customerName},`,
    '',
    `We have recorded your payment of *${opts.currency} ${formatMoney(opts.amount)}* on ${d}.`,
  ];
  if (opts.note?.trim()) lines.push('', `Reference: ${opts.note.trim()}`);
  lines.push('', 'If anything looks incorrect, please reply and we will fix it.');
  return lines.join('\n');
}

function buildKhataPaymentDescriptionPreview(
  invoices: Array<{ ref: string; amount: number }>,
  totalAmount: number,
  userNote?: string
): string {
  const invPart = invoices.map((i) => `${i.ref} (${formatMoney(i.amount)})`).join('; ');
  let text = `Payment ${formatMoney(totalAmount)} — Invoices: ${invPart}`;
  if (userNote?.trim()) text += ` — ${userNote.trim()}`;
  return text;
}

function buildKhataPendingReminderMessage(
  customerName: string,
  currency: string,
  closing: number,
  ledger: KhataLedgerEntry[],
  remainingOnDebit: (e: KhataLedgerEntry) => number
): string {
  const open = ledger.filter((e) => e.type === 'debit' && remainingOnDebit(e) > PAID_EPS);
  const lines = [
    `*Reminder — balance due*`,
    '',
    `Hi ${customerName},`,
    '',
    `Your current balance with us is *${currency} ${formatMoney(Math.max(0, closing))}*.`,
  ];
  if (open.length > 0) {
    lines.push('', '*Open amounts by invoice:*');
    for (const e of open.slice(0, 8)) {
      const ref = referenceLabel(e);
      const due = remainingOnDebit(e);
      lines.push(`• ${ref} — ${currency} ${formatMoney(due)} (${new Date(e.created_at).toLocaleDateString()})`);
    }
    if (open.length > 8) lines.push(`… and ${open.length - 8} more`);
  }
  lines.push('', 'Please arrange payment when convenient. Thank you.');
  return lines.join('\n');
}

const KhataPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<KhataSummaryRow[]>([]);
  const [ledger, setLedger] = useState<KhataLedgerEntry[]>([]);
  const [allLedger, setAllLedger] = useState<KhataLedgerEntry[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveCustomerId, setReceiveCustomerId] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveNote, setReceiveNote] = useState('');
  const [receiveBankAccountId, setReceiveBankAccountId] = useState('');
  const [depositAccounts, setDepositAccounts] = useState<ShopBankAccount[]>([]);
  const [receiveCustomerLocked, setReceiveCustomerLocked] = useState(false);
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveSelectedDebitIds, setReceiveSelectedDebitIds] = useState<string[]>([]);
  const [receiveCustomerLedger, setReceiveCustomerLedger] = useState<KhataLedgerEntry[]>([]);
  const [receiveLedgerLoading, setReceiveLedgerLoading] = useState(false);
  const [customers, setCustomers] = useState<
    { id: string; name: string; contact_no: string | null; company_name?: string | null }[]
  >([]);
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directorySort, setDirectorySort] = useState<{ col: 'name' | 'balance'; dir: 'asc' | 'desc' }>({
    col: 'name',
    dir: 'asc',
  });
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'all' | 'invoices' | 'payments'>('all');
  const [customerFooter, setCustomerFooter] = useState<{
    totalDebit: number;
    totalCredit: number;
    balance: number;
  } | null>(null);
  const [editingEntry, setEditingEntry] = useState<KhataLedgerEntry | null>(null);
  const [editType, setEditType] = useState<'debit' | 'credit'>('debit');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [entryPendingDelete, setEntryPendingDelete] = useState<KhataLedgerEntry | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [overdueListModalOpen, setOverdueListModalOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const data = await khataApi.getSummary();
      setSummary(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Khata summary failed', e);
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllLedger = useCallback(async () => {
    try {
      const data = await khataApi.getLedger();
      setAllLedger(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Khata full ledger failed', e);
      setAllLedger([]);
    }
  }, []);

  const loadLedger = useCallback(async (customerId: string) => {
    try {
      const data = await khataApi.getLedger(customerId);
      setLedger(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Khata ledger failed', e);
      setLedger([]);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const data = await khataApi.getCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setCustomers([]);
    }
  }, []);

  const loadDepositAccounts = useCallback(async () => {
    try {
      const data = await shopApi.getBankAccounts(true);
      setDepositAccounts(Array.isArray(data) ? data : []);
    } catch {
      setDepositAccounts([]);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadAllLedger();
    void loadCustomers();
  }, [loadSummary, loadAllLedger, loadCustomers]);

  useEffect(() => {
    const st = location.state as { customerId?: string; customerName?: string } | undefined;
    if (st?.customerId) {
      setSelectedCustomerId(st.customerId);
      setSelectedCustomerName(st.customerName ?? '');
    }
  }, [location.state]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setLedger([]);
      return;
    }
    void loadLedger(selectedCustomerId);
  }, [selectedCustomerId, loadLedger]);

  useEffect(() => {
    setLedgerTypeFilter('all');
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerFooter(null);
      return;
    }
    let cancelled = false;
    void khataApi
      .getCustomerSummary(selectedCustomerId)
      .then((d) => {
        if (!cancelled && d) setCustomerFooter(d);
      })
      .catch(() => {
        if (!cancelled) setCustomerFooter(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, ledger]);

  useEffect(() => {
    if (receiveModalOpen) {
      void loadCustomers();
      void loadDepositAccounts();
    }
  }, [receiveModalOpen, loadCustomers, loadDepositAccounts]);

  const debitRemaining = (entry: KhataLedgerEntry): number => {
    if (entry.type !== 'debit') return 0;
    const r = entry.remaining_debit;
    if (typeof r === 'number' && Number.isFinite(r)) return Math.max(0, r);
    return entry.amount;
  };

  const debitLineStatus = (entry: KhataLedgerEntry): 'paid' | 'partial' | 'open' | null => {
    if (entry.type !== 'debit') return null;
    const rem = debitRemaining(entry);
    const amt = entry.amount;
    if (rem <= PAID_EPS) return 'paid';
    if (rem >= amt - PAID_EPS) return 'open';
    return 'partial';
  };

  useEffect(() => {
    if (!receiveModalOpen || !receiveCustomerId) {
      setReceiveCustomerLedger([]);
      setReceiveLedgerLoading(false);
      return;
    }
    let cancelled = false;
    setReceiveLedgerLoading(true);
    void khataApi
      .getLedger(receiveCustomerId)
      .then((data) => {
        if (!cancelled) setReceiveCustomerLedger(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setReceiveCustomerLedger([]);
      })
      .finally(() => {
        if (!cancelled) setReceiveLedgerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [receiveModalOpen, receiveCustomerId]);

  const receiveUnpaidInvoices = useMemo(() => {
    return receiveCustomerLedger
      .filter((e) => e.type === 'debit' && debitRemaining(e) > PAID_EPS)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [receiveCustomerLedger]);

  useEffect(() => {
    if (receiveSelectedDebitIds.length === 0) return;
    const sum = receiveUnpaidInvoices
      .filter((e) => receiveSelectedDebitIds.includes(e.id))
      .reduce((s, e) => s + debitRemaining(e), 0);
    if (sum > PAID_EPS) setReceiveAmount(sum.toFixed(2));
  }, [receiveSelectedDebitIds, receiveUnpaidInvoices]);

  const receivePaymentDescriptionPreview = useMemo(() => {
    if (receiveSelectedDebitIds.length === 0) return null;
    const invoices = receiveUnpaidInvoices
      .filter((e) => receiveSelectedDebitIds.includes(e.id))
      .map((e) => ({ ref: referenceLabel(e), amount: debitRemaining(e) }));
    const total = invoices.reduce((s, i) => s + i.amount, 0);
    if (total <= PAID_EPS) return null;
    return buildKhataPaymentDescriptionPreview(invoices, total, receiveNote);
  }, [receiveSelectedDebitIds, receiveUnpaidInvoices, receiveNote]);

  const contactById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const totalReceivables = useMemo(
    () => summary.reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0),
    [summary]
  );

  const aggDebit = useMemo(() => summary.reduce((s, r) => s + r.total_debit, 0), [summary]);
  const aggCredit = useMemo(() => summary.reduce((s, r) => s + r.total_credit, 0), [summary]);

  const collectionEfficiencyPct = useMemo(() => {
    if (aggDebit <= PAID_EPS) return 100;
    return Math.min(100, Math.round((aggCredit / aggDebit) * 1000) / 10);
  }, [aggDebit, aggCredit]);

  const { dsoDays, disputeCount, disputeValue, overdueDeltaVsCritical, openDebitRemSum } = useMemo(() => {
    const debits = allLedger.filter((e) => e.type === 'debit');
    let weighted = 0;
    let remSum = 0;
    for (const e of debits) {
      const rem = debitRemaining(e);
      if (rem <= PAID_EPS) continue;
      const days = daysSince(e.created_at);
      weighted += rem * days;
      remSum += rem;
    }
    const dso = remSum > PAID_EPS ? Math.round((weighted / remSum) * 10) / 10 : 0;

    let dc = 0;
    let dv = 0;
    for (const e of debits) {
      const rem = debitRemaining(e);
      if (rem <= PAID_EPS) continue;
      if (daysSince(e.created_at) > OVERDUE_AFTER_DAYS) {
        dc += 1;
        dv += rem;
      }
    }
    const overdueDelta = Math.max(0, Math.round((dso - DSO_CRITICAL_DAYS) * 10) / 10);
    return {
      dsoDays: dso,
      disputeCount: dc,
      disputeValue: dv,
      overdueDeltaVsCritical: overdueDelta,
      openDebitRemSum: remSum,
    };
  }, [allLedger]);

  const avgPaymentCycleDays = useMemo(() => {
    if (!selectedCustomerId || ledger.length === 0) return null;
    const debits = new Map<string, KhataLedgerEntry>();
    for (const e of ledger) {
      if (e.type === 'debit') debits.set(e.id, e);
    }
    const lapses: number[] = [];
    for (const e of ledger) {
      if (e.type !== 'credit' || !e.linked_debit_id) continue;
      const d = debits.get(e.linked_debit_id);
      if (!d) continue;
      const a = new Date(d.created_at).getTime();
      const b = new Date(e.created_at).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      lapses.push(Math.max(0, Math.round((b - a) / (86400 * 1000))));
    }
    if (lapses.length === 0) return null;
    return Math.round((lapses.reduce((s, x) => s + x, 0) / lapses.length) * 10) / 10;
  }, [selectedCustomerId, ledger]);

  const nextMilestone = useMemo(() => {
    if (!selectedCustomerId || ledger.length === 0) return null;
    const openDebits = ledger.filter((e) => e.type === 'debit' && debitRemaining(e) > PAID_EPS);
    if (openDebits.length === 0) return null;
    const oldest = [...openDebits].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
    const due = new Date(oldest.created_at);
    due.setDate(due.getDate() + OVERDUE_AFTER_DAYS);
    const rem = debitRemaining(oldest);
    return { date: due, amount: rem };
  }, [selectedCustomerId, ledger]);

  const unallocatedPayments = useMemo(() => {
    if (!selectedCustomerId) return 0;
    return ledger
      .filter((e) => e.type === 'credit' && !e.linked_debit_id)
      .reduce((s, e) => s + e.amount, 0);
  }, [selectedCustomerId, ledger]);

  const directoryRows = useMemo(() => {
    const q = directoryQuery.trim().toLowerCase();
    return summary.filter((row) => {
      if (!q) return true;
      const c = contactById.get(row.customer_id);
      const climit = ''; // no credit limit column in schema — placeholder for search UX
      const hay = [
        row.customer_name,
        c?.company_name,
        c?.contact_no,
        clientCode(row.customer_id),
        climit,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [summary, directoryQuery, contactById]);

  const toggleDirectorySort = useCallback((col: 'name' | 'balance') => {
    setDirectorySort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));
  }, []);

  const sortedDirectoryRows = useMemo(() => {
    const rows = [...directoryRows];
    const mult = directorySort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (directorySort.col === 'name') {
        const c = a.customer_name.localeCompare(b.customer_name, undefined, { sensitivity: 'base' });
        if (c !== 0) return c * mult;
        return a.customer_id.localeCompare(b.customer_id) * mult;
      }
      const c = a.balance - b.balance;
      if (c !== 0) return (c < 0 ? -1 : 1) * mult;
      return a.customer_name.localeCompare(b.customer_name, undefined, { sensitivity: 'base' }) * mult;
    });
    return rows;
  }, [directoryRows, directorySort]);

  const activeLedger = useMemo(
    () => (selectedCustomerId ? ledger : allLedger),
    [selectedCustomerId, ledger, allLedger]
  );

  const sortLedgerRecentFirst = useCallback((rows: KhataLedgerEntry[]) => {
    return [...rows].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (ta !== tb) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });
  }, []);

  const displayedLedger = useMemo(() => {
    let rows = activeLedger;
    if (ledgerTypeFilter === 'invoices') rows = rows.filter((e) => e.type === 'debit');
    if (ledgerTypeFilter === 'payments') rows = rows.filter((e) => e.type === 'credit');
    return sortLedgerRecentFirst(rows);
  }, [activeLedger, ledgerTypeFilter, sortLedgerRecentFirst]);

  const memberNameForEntry = useCallback(
    (entry: KhataLedgerEntry) =>
      entry.customer_name?.trim() ||
      summary.find((s) => s.customer_id === entry.customer_id)?.customer_name ||
      contactById.get(entry.customer_id)?.name ||
      '—',
    [summary, contactById]
  );

  const overdueDebitRows = useMemo(() => {
    return allLedger
      .filter((e) => {
        if (e.type !== 'debit') return false;
        const rem = debitRemaining(e);
        if (rem <= PAID_EPS) return false;
        return daysSince(e.created_at) > OVERDUE_AFTER_DAYS;
      })
      .map((e) => ({
        entry: e,
        memberName: memberNameForEntry(e),
        daysOverdue: daysSince(e.created_at),
        dueAmount: debitRemaining(e),
        ref: referenceLabel(e),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue || b.dueAmount - a.dueAmount);
  }, [allLedger, memberNameForEntry]);

  const selectMember = useCallback((customerId: string, customerName: string) => {
    setSelectedCustomerId(customerId);
    setSelectedCustomerName(customerName);
  }, []);

  const selectedContact = selectedCustomerId ? contactById.get(selectedCustomerId) : undefined;
  const highRisk =
    (customerFooter?.balance ?? 0) > 300000 ||
    (() => {
      if (!selectedCustomerId) return false;
      return allLedger.some(
        (e) =>
          e.customer_id === selectedCustomerId &&
          e.type === 'debit' &&
          debitRemaining(e) > PAID_EPS &&
          daysSince(e.created_at) > DSO_CRITICAL_DAYS
      );
    })();

  const resetReceiveModalForm = () => {
    setReceiveSelectedDebitIds([]);
    setReceiveCustomerId('');
    setReceiveAmount('');
    setReceiveNote('');
    setReceiveBankAccountId('');
    setReceiveCustomerLocked(false);
  };

  const openReceiveModal = () => {
    resetReceiveModalForm();
    setReceiveModalOpen(true);
  };

  const openReceiveModalForCurrentCustomer = () => {
    if (!selectedCustomerId) return;
    setReceiveCustomerLocked(true);
    setReceiveSelectedDebitIds([]);
    setReceiveCustomerId(selectedCustomerId);
    setReceiveAmount('');
    setReceiveNote('');
    setReceiveBankAccountId('');
    setReceiveModalOpen(true);
  };

  const toggleReceiveInvoice = (debitId: string) => {
    setReceiveSelectedDebitIds((prev) =>
      prev.includes(debitId) ? prev.filter((id) => id !== debitId) : [...prev, debitId]
    );
  };

  const selectAllReceiveInvoices = () => {
    setReceiveSelectedDebitIds(receiveUnpaidInvoices.map((e) => e.id));
  };

  const clearReceiveInvoiceSelection = () => {
    setReceiveSelectedDebitIds([]);
  };

  const noteFromLedgerEntry = (entry: KhataLedgerEntry): string => {
    if (entry.sale_number && entry.note) return `${entry.note} (${entry.sale_number})`;
    if (entry.sale_number) return `Payment for ${entry.sale_number}`;
    if (entry.note) return `Payment toward: ${entry.note}`;
    return '';
  };

  const openReceiveModalFromEntry = (entry: KhataLedgerEntry) => {
    if (entry.type !== 'debit') return;
    const cid = selectedCustomerId || entry.customer_id;
    setReceiveCustomerLocked(true);
    setReceiveSelectedDebitIds([entry.id]);
    setReceiveCustomerId(cid);
    const due =
      typeof entry.remaining_debit === 'number' && Number.isFinite(entry.remaining_debit)
        ? Math.max(0, entry.remaining_debit)
        : entry.amount;
    setReceiveAmount(String(due));
    setReceiveNote('');
    setReceiveBankAccountId('');
    setReceiveModalOpen(true);
  };

  const refreshSummaryAndLedger = useCallback(async () => {
    let arr: KhataSummaryRow[] = [];
    try {
      const data = await khataApi.getSummary();
      arr = Array.isArray(data) ? data : [];
      setSummary(arr);
    } catch {
      setSummary([]);
    }
    try {
      const full = await khataApi.getLedger();
      setAllLedger(Array.isArray(full) ? full : []);
    } catch {
      setAllLedger([]);
    }
    const stillListed =
      selectedCustomerId != null && arr.some((r) => r.customer_id === selectedCustomerId);
    if (!stillListed && selectedCustomerId) {
      setSelectedCustomerId(null);
      setSelectedCustomerName('');
      setLedger([]);
    } else if (stillListed && selectedCustomerId) {
      await loadLedger(selectedCustomerId);
    }
  }, [selectedCustomerId, loadLedger]);

  const openEditEntry = (entry: KhataLedgerEntry) => {
    setEditingEntry(entry);
    setEditType(entry.type);
    setEditAmount(String(entry.amount));
    setEditNote(entry.note ?? '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    const amount = parseFloat(editAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setEditSubmitting(true);
    try {
      await khataApi.updateLedgerEntry(editingEntry.id, {
        type: editType,
        amount,
        note: editNote.trim() || null,
      });
      setEditingEntry(null);
      await refreshSummaryAndLedger();
      void loadCustomers();
    } catch (err) {
      console.error('Update khata entry failed', err);
      alert('Failed to update entry. Please try again.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!entryPendingDelete) return;
    setDeleteSubmitting(true);
    try {
      await khataApi.deleteLedgerEntry(entryPendingDelete.id);
      setEntryPendingDelete(null);
      await refreshSummaryAndLedger();
      void loadCustomers();
    } catch (err) {
      console.error('Delete khata entry failed', err);
      alert('Failed to delete entry. Please try again.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(receiveAmount);
    if (!receiveCustomerId || !receiveBankAccountId || !amount || amount <= 0) return;

    let allocations = receiveUnpaidInvoices
      .filter((inv) => receiveSelectedDebitIds.includes(inv.id))
      .map((inv) => ({ debitLedgerId: inv.id, amount: debitRemaining(inv) }));

    if (allocations.length === 1 && amount < allocations[0].amount - PAID_EPS) {
      allocations = [{ ...allocations[0], amount: Math.round(amount * 100) / 100 }];
    }

    if (allocations.length > 0) {
      const allocSum = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
      if (Math.abs(allocSum - amount) > 0.01) {
        alert(
          `Amount (${CURRENCY} ${formatMoney(amount)}) must match the total of selected invoices (${CURRENCY} ${formatMoney(allocSum)}).`
        );
        return;
      }
    }

    const payCustomerId = receiveCustomerId;
    const payAmount = amount;
    const payNote = receiveNote.trim();
    const payName =
      customers.find((c) => c.id === payCustomerId)?.name ||
      (payCustomerId === selectedCustomerId ? selectedCustomerName : '') ||
      'Customer';
    const payPhone = customers.find((c) => c.id === payCustomerId)?.contact_no ?? null;
    const paymentDescription = receivePaymentDescriptionPreview;
    setReceiveSubmitting(true);
    try {
      await khataApi.receivePayment({
        customerId: payCustomerId,
        amount: payAmount,
        bankAccountId: receiveBankAccountId,
        note: payNote || undefined,
        ...(allocations.length > 0 ? { allocations } : {}),
      });
      setReceiveModalOpen(false);
      resetReceiveModalForm();
      await refreshSummaryAndLedger();
      void loadCustomers();
      if (normalizeWhatsAppPhone(payPhone)) {
        const msg = buildKhataPaymentConfirmationMessage({
          customerName: payName,
          amount: payAmount,
          currency: CURRENCY,
          note: paymentDescription || payNote || undefined,
        });
        openWhatsAppTextMessage(msg, payPhone ?? undefined);
      }
    } catch (err) {
      console.error('Receive payment failed', err);
      alert('Failed to record payment. Please try again.');
    } finally {
      setReceiveSubmitting(false);
    }
  };

  const openSaleDetail = (invoice: string) => {
    navigate('/pos', { state: { openSaleInvoice: invoice } });
  };

  const sendStatementWhatsApp = () => {
    if (!selectedCustomerId || !selectedCustomerName) {
      alert('Select a customer first.');
      return;
    }
    const phone = selectedContact?.contact_no;
    if (!normalizeWhatsAppPhone(phone)) {
      alert(
        'This customer needs a valid mobile number (Pakistan 03… or 923…) on their contact record to open WhatsApp.'
      );
      return;
    }
    const closing = customerFooter?.balance ?? summary.find((s) => s.customer_id === selectedCustomerId)?.balance ?? 0;
    const text = buildWhatsappStatementMessage(selectedCustomerName, closing, ledger);
    openWhatsAppTextMessage(text, phone ?? undefined);
  };

  const sendPendingReminderWhatsApp = () => {
    if (!selectedCustomerId || !selectedCustomerName) {
      alert('Select a customer first.');
      return;
    }
    const phone = selectedContact?.contact_no;
    if (!normalizeWhatsAppPhone(phone)) {
      alert('Add a valid mobile number on this contact to send a WhatsApp reminder.');
      return;
    }
    const closing = customerFooter?.balance ?? summary.find((s) => s.customer_id === selectedCustomerId)?.balance ?? 0;
    if (closing <= PAID_EPS) {
      alert('This customer has no balance due.');
      return;
    }
    const text = buildKhataPendingReminderMessage(selectedCustomerName, CURRENCY, closing, ledger, debitRemaining);
    openWhatsAppTextMessage(text, phone ?? undefined);
  };

  const openMemberWhatsAppChat = () => {
    const phone = selectedContact?.contact_no;
    if (!normalizeWhatsAppPhone(phone)) {
      alert('No valid WhatsApp number on file for this member.');
      return;
    }
    openWhatsAppTextMessage(`Hi ${selectedCustomerName}`, phone ?? undefined);
  };

  const exportLedgerCsv = () => {
    if (!selectedCustomerId || ledger.length === 0) {
      alert('Select a customer with ledger rows to export.');
      return;
    }
    const rows = [
      ['Date', 'Type', 'Status', 'Reference', 'Debit', 'Credit', 'Note'].join(','),
      ...ledger.map((e) => {
        const st = entryStatusBadge(e, debitLineStatus).label;
        const ref = referenceLabel(e);
        const d = e.type === 'debit' ? String(e.amount) : '';
        const c = e.type === 'credit' ? String(e.amount) : '';
        const note = (e.note || '').replace(/"/g, '""');
        return [
          new Date(e.created_at).toISOString(),
          rowDisplayType(e),
          st,
          ref,
          d,
          c,
          `"${note}"`,
        ].join(',');
      }),
    ].join('\r\n');
    const blob = new Blob(['\ufeff' + rows], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `khata-${selectedCustomerName.replace(/\s+/g, '_') || selectedCustomerId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
      <div className="shrink-0 border-b border-slate-200 bg-slate-100 px-4 py-5 dark:border-slate-800 dark:bg-slate-950 md:px-8 md:py-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Receivables
              </div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {CURRENCY} {formatMoney(totalReceivables)}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">All customers with a balance due</div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Collection Efficiency
              </div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {collectionEfficiencyPct.toFixed(1)}%
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-700 transition-all dark:bg-emerald-600"
                  style={{ width: `${Math.min(100, collectionEfficiencyPct)}%` }}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Days Sales Outstanding (DSO)
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {openDebitRemSum > PAID_EPS ? `${dsoDays} Days` : '—'}
                </span>
                {dsoDays > DSO_CRITICAL_DAYS && (
                  <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800 dark:bg-red-950/60 dark:text-red-300">
                    +{overdueDeltaVsCritical} vs threshold
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Critical threshold: {DSO_CRITICAL_DAYS} (weighted by open debits)
              </div>
            </div>
            <button
              type="button"
              onClick={() => disputeCount > 0 && setOverdueListModalOpen(true)}
              disabled={disputeCount === 0}
              className={`rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 ${
                disputeCount > 0
                  ? 'cursor-pointer hover:border-amber-300 hover:bg-amber-50/50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:hover:border-amber-800 dark:hover:bg-amber-950/20'
                  : 'cursor-default opacity-95'
              }`}
              title={
                disputeCount > 0
                  ? `View ${disputeCount} open invoice${disputeCount === 1 ? '' : 's'} over ${OVERDUE_AFTER_DAYS} days`
                  : `No open debits over ${OVERDUE_AFTER_DAYS} days`
              }
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pending attention
              </div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {disputeCount}
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                Open debits over {OVERDUE_AFTER_DAYS}d: {CURRENCY} {formatMoney(disputeValue)}
                {disputeCount > 0 && (
                  <span className="mt-1 block font-semibold text-amber-700 dark:text-amber-400">Click to view list</span>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 lg:min-h-[calc(100dvh-14rem)] lg:flex-row lg:items-stretch">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600 dark:border-violet-950 dark:border-t-violet-400" />
            </div>
          ) : (
            <>
              <aside className="flex w-full shrink-0 flex-col lg:w-80 lg:min-w-[20rem] xl:w-96">
                <div className="card flex max-h-[min(52dvh,520px)] min-h-[280px] flex-1 flex-col overflow-hidden p-0 shadow-sm lg:h-full lg:max-h-none lg:min-h-0">
                  <div className="shrink-0 border-b border-border bg-muted/30 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <FolderTree className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Members</h2>
                        <p className="truncate text-[10px] text-muted-foreground">Receivables by member (khata)</p>
                        <label htmlFor="member-tree-search" className="sr-only">
                          Filter members
                        </label>
                        <div className="relative mt-2">
                          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <input
                            id="member-tree-search"
                            type="search"
                            autoComplete="off"
                            value={directoryQuery}
                            onChange={(e) => setDirectoryQuery(e.target.value)}
                            placeholder="Filter by name, ID, phone…"
                            className="input input-text h-9 w-full rounded-lg py-1.5 pl-8 pr-2 text-sm placeholder:text-muted-foreground"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setDirectoryQuery('')}
                          className="mt-1.5 text-[10px] font-semibold text-primary hover:underline"
                        >
                          Clear filter
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                    <div
                      className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-card px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDirectorySort('name')}
                        className={`flex min-w-0 items-center gap-0.5 text-left font-bold uppercase tracking-wider transition-colors hover:text-foreground ${
                          directorySort.col === 'name' ? 'text-foreground' : ''
                        }`}
                        aria-label={
                          directorySort.col === 'name'
                            ? `Member sorted ${directorySort.dir === 'asc' ? 'A–Z' : 'Z–A'}`
                            : 'Sort by member name'
                        }
                      >
                        <span className="truncate">Member</span>
                        {directorySort.col === 'name' &&
                          (directorySort.dir === 'asc' ? (
                            <ChevronUp className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                          ))}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDirectorySort('balance')}
                        className={`flex shrink-0 items-center justify-end gap-0.5 whitespace-nowrap text-right font-bold uppercase tracking-wider transition-colors hover:text-foreground ${
                          directorySort.col === 'balance' ? 'text-foreground' : ''
                        }`}
                        aria-label={
                          directorySort.col === 'balance'
                            ? `Balance sorted ${directorySort.dir === 'asc' ? 'low to high' : 'high to low'}`
                            : 'Sort by amount payable'
                        }
                      >
                        <span>Payable</span>
                        {directorySort.col === 'balance' &&
                          (directorySort.dir === 'asc' ? (
                            <ChevronUp className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                          ))}
                      </button>
                    </div>
                    <ul className="space-y-0.5 p-2 pt-1.5" aria-label="Members with khata balance">
                      {sortedDirectoryRows.length === 0 ? (
                        <li className="px-1 py-8 text-center text-xs text-muted-foreground">
                          No matching members with khata activity.
                        </li>
                      ) : (
                        sortedDirectoryRows.map((row) => {
                          const selected = selectedCustomerId === row.customer_id;
                          const balStr = `${CURRENCY} ${formatMoney(row.balance)}`;
                          return (
                            <li key={row.customer_id}>
                              <button
                                type="button"
                                onClick={() => selectMember(row.customer_id, row.customer_name)}
                                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                                  selected
                                    ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                                    : 'border-transparent hover:bg-muted/80'
                                }`}
                              >
                                <div className="min-w-0">
                                  <span className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                      {initials(row.customer_name)}
                                    </span>
                                    <span className="min-w-0 truncate text-sm font-semibold">{row.customer_name}</span>
                                  </span>
                                </div>
                                <span
                                  className={`shrink-0 text-xs font-semibold tabular-nums ${
                                    row.balance > PAID_EPS ? 'text-destructive' : 'text-muted-foreground'
                                  }`}
                                  title={balStr}
                                >
                                  {balStr}
                                </span>
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                </div>
              </aside>

              {/* Ledger detail */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="card flex min-h-[min(48dvh,360px)] flex-1 flex-col overflow-hidden p-0 shadow-sm lg:min-h-0">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-3 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                      <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {selectedCustomerId ? 'Khata ledger' : 'All transactions'}
                      </span>
                      <div
                        className="inline-flex rounded-lg border border-border bg-background p-0.5 shadow-sm"
                        role="group"
                        aria-label="Filter by transaction type"
                      >
                        {(
                          [
                            { id: 'all' as const, label: 'All' },
                            { id: 'invoices' as const, label: 'Invoices' },
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
                      {!selectedCustomerId && (
                        <span className="text-xs text-muted-foreground">Newest first · select a member to filter</span>
                      )}
                    </div>
                    {selectedCustomerId && (
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={sendStatementWhatsApp}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
                          title="Send full statement on WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4 shrink-0" />
                          Statement
                        </button>
                        <button
                          type="button"
                          onClick={sendPendingReminderWhatsApp}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
                          title="Send pending balance reminder on WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                          Remind
                        </button>
                        <button
                          type="button"
                          onClick={exportLedgerCsv}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
                        >
                          <Download className="h-4 w-4 shrink-0" />
                          Export
                        </button>
                        <button
                          type="button"
                          onClick={openReceiveModalForCurrentCustomer}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                        >
                          <Wallet className="h-4 w-4 shrink-0" />
                          Receive Payment
                        </button>
                      </div>
                    )}
                  </div>

                  {selectedCustomerId && (
                    <div className="border-b border-border px-6 py-4 md:px-8">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{selectedCustomerName}</h1>
                          {highRisk && (
                            <span className="rounded-full bg-destructive/15 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-destructive">
                              High risk
                            </span>
                          )}
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tax ID</div>
                            <div className="mt-1 text-foreground">—</div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment terms</div>
                            <div className="mt-1 text-foreground">On account</div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-foreground">
                              <span>
                                {selectedContact?.name || selectedCustomerName}
                                {selectedContact?.contact_no && (
                                  <>
                                    {' · '}
                                    <span className="text-primary">{selectedContact.contact_no}</span>
                                  </>
                                )}
                              </span>
                              {selectedContact?.contact_no && normalizeWhatsAppPhone(selectedContact.contact_no) ? (
                                <button
                                  type="button"
                                  onClick={openMemberWhatsAppChat}
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 hover:bg-muted dark:text-emerald-400"
                                >
                                  <MessageCircle className="h-3 w-3" />
                                  WhatsApp
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="min-h-0 flex-1 overflow-auto">
                    {activeLedger.length === 0 ? (
                      <div className="p-12 text-center text-sm text-muted-foreground">
                        {selectedCustomerId ? 'No transactions for this member.' : 'No khata transactions yet.'}
                      </div>
                    ) : displayedLedger.length === 0 ? (
                      <div className="p-12 text-center text-sm text-muted-foreground">
                        No rows match this filter. Choose &quot;All&quot; to see every invoice and payment.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-xs leading-tight">
                          <thead className="sticky top-0 z-10 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-4 py-1.5">Date</th>
                              {!selectedCustomerId && <th className="px-3 py-1.5">Member</th>}
                              <th className="px-3 py-1.5">Type</th>
                              <th className="px-3 py-1.5">Status</th>
                              <th className="px-3 py-1.5">Reference</th>
                              <th className="px-3 py-1.5 text-right">Amount</th>
                              <th className="w-[1%] whitespace-nowrap px-4 py-1.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {displayedLedger.map((entry) => {
                              const badge = entryStatusBadge(entry, debitLineStatus);
                              const ref = referenceLabel(entry);
                              const inv = khataEntrySaleInvoice(entry);
                              const typ = rowDisplayType(entry);
                              const memberName = memberNameForEntry(entry);
                              const showDue =
                                entry.type === 'debit' && debitLineStatus(entry) !== 'paid';
                              return (
                                <tr key={entry.id} className="hover:bg-muted/50">
                                  <td className="whitespace-nowrap px-4 py-1.5 text-slate-600 dark:text-slate-400">
                                    {new Date(entry.created_at).toLocaleDateString(undefined, {
                                      day: 'numeric',
                                      month: 'short',
                                      year: '2-digit',
                                    })}
                                  </td>
                                  {!selectedCustomerId && (
                                    <td className="max-w-[180px] px-3 py-1.5">
                                      <button
                                        type="button"
                                        onClick={() => selectMember(entry.customer_id, memberName)}
                                        className="truncate text-left text-xs font-semibold text-primary hover:underline"
                                        title={`View ${memberName}'s ledger`}
                                      >
                                        {memberName}
                                      </button>
                                    </td>
                                  )}
                                  <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200">
                                    {typ}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-1.5">
                                    <span
                                      className={`inline-flex rounded px-1.5 py-0 text-[10px] font-bold uppercase leading-5 tracking-wide ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className="max-w-[200px] truncate px-3 py-1.5 text-slate-600 dark:text-slate-400">
                                    {inv ? (
                                      <button
                                        type="button"
                                        onClick={() => openSaleDetail(inv)}
                                        className="truncate font-semibold text-blue-600 hover:underline dark:text-blue-400"
                                        title={ref}
                                      >
                                        {ref}
                                      </button>
                                    ) : (
                                      <span className="truncate font-medium text-blue-600 dark:text-blue-400" title={ref}>
                                        {ref}
                                      </span>
                                    )}
                                  </td>
                                  <td
                                    className={`whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums ${
                                      entry.type === 'credit'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    <span className="font-semibold">
                                      {entry.type === 'debit' ? '+' : '−'}
                                      {CURRENCY} {formatMoney(entry.amount)}
                                    </span>
                                    {showDue && (
                                      <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">
                                        · Due {CURRENCY} {formatMoney(debitRemaining(entry))}
                                      </span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-1.5 text-right">
                                    <div className="inline-flex items-center justify-end gap-0.5">
                                      {entry.type === 'debit' && debitLineStatus(entry) !== 'paid' && (
                                        <button
                                          type="button"
                                          onClick={() => openReceiveModalFromEntry(entry)}
                                          className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-emerald-700"
                                        >
                                          Receive
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => openEditEntry(entry)}
                                        className="rounded p-1 text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/40 dark:hover:text-violet-400"
                                        title="Edit entry"
                                        aria-label="Edit entry"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEntryPendingDelete(entry)}
                                        className="rounded p-1 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                                        title="Delete entry"
                                        aria-label="Delete entry"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {selectedCustomerId && customerFooter && (
                      <div className="border-t border-slate-200 bg-slate-100/90 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/50 md:px-8">
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:gap-6">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Total debit{' '}
                            <span className="ml-1 font-mono text-sm text-slate-900 dark:text-white">
                              {CURRENCY} {formatMoney(customerFooter.totalDebit)}
                            </span>
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Total credit{' '}
                            <span className="ml-1 font-mono text-sm text-slate-900 dark:text-white">
                              {CURRENCY} {formatMoney(customerFooter.totalCredit)}
                            </span>
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Unallocated payments{' '}
                            <span className="ml-1 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              {CURRENCY} {formatMoney(unallocatedPayments)}
                            </span>
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                            Closing balance{' '}
                            <span className="ml-1 font-mono text-base font-bold text-slate-900 dark:text-white">
                              {CURRENCY} {formatMoney(customerFooter.balance)}
                            </span>
                          </div>
                        </div>
                      </div>
                  )}

                  {selectedCustomerId && (
                    <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-6 dark:border-slate-800 md:grid-cols-3 md:p-8">
                      <div className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average payment cycle</div>
                          <div className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white">
                            {avgPaymentCycleDays != null ? `${avgPaymentCycleDays} Days` : '—'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credit limit utilization</div>
                          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Not set</div>
                          <div className="text-xs text-slate-500">Add a credit limit on the contact when available</div>
                        </div>
                      </div>
                      <div className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next milestone</div>
                          <div className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white">
                            {nextMilestone
                              ? `${nextMilestone.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${CURRENCY} ${formatMoney(nextMilestone.amount)}`
                              : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Floating receive for any customer — match prior capability */}
      <button
        type="button"
        onClick={openReceiveModal}
        className="fixed bottom-6 right-6 z-20 inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-violet-700 dark:bg-violet-500 md:hidden"
      >
        <Wallet className="h-4 w-4" />
        Receive
      </button>

      <Modal
        isOpen={receiveModalOpen}
        onClose={() => {
          if (receiveSubmitting) return;
          setReceiveModalOpen(false);
          resetReceiveModalForm();
        }}
        title="Receive Payment"
        size="lg"
      >
        <form onSubmit={handleReceivePayment} className="space-y-5">
          {receiveCustomerLocked && selectedCustomerName && (
            <p className="rounded-lg border border-border bg-muted/80 px-3 py-2 text-xs text-muted-foreground">
              Ledger: <span className="font-bold text-foreground">{selectedCustomerName}</span>
              {receiveSelectedDebitIds.length > 0 ? (
                <span className="mt-1 block font-semibold text-emerald-700 dark:text-emerald-400">
                  {receiveSelectedDebitIds.length} invoice{receiveSelectedDebitIds.length === 1 ? '' : 's'} selected for
                  settlement.
                </span>
              ) : (
                <span className="mt-1 block">Select unpaid invoices below, or enter an unallocated payment amount.</span>
              )}
            </p>
          )}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Customer</label>
            <select
              aria-label="Select customer"
              value={receiveCustomerId}
              onChange={(e) => {
                setReceiveCustomerId(e.target.value);
                setReceiveSelectedDebitIds([]);
                setReceiveAmount('');
              }}
              disabled={receiveSubmitting || receiveCustomerLocked}
              className="w-full rounded-md border border-gray-200 bg-background px-4 py-3 text-foreground outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-600 dark:bg-gray-900/90"
              required
            >
              <option value="">Select customer</option>
              {receiveCustomerId &&
                !customers.some((c) => c.id === receiveCustomerId) &&
                selectedCustomerName && (
                  <option value={receiveCustomerId}>{selectedCustomerName} (current)</option>
                )}
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.contact_no ? ` — ${c.contact_no}` : ''}
                </option>
              ))}
            </select>
            {receiveCustomerLocked && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Customer is fixed to match this ledger. Use the floating Receive button (mobile) or clear selection to pick
                another customer from the directory first.
              </p>
            )}
          </div>

          {receiveCustomerId && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Unpaid invoices
                </label>
                {receiveUnpaidInvoices.length > 0 && (
                  <div className="flex gap-2 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={selectAllReceiveInvoices}
                      className="text-primary hover:underline"
                      disabled={receiveSubmitting}
                    >
                      Select all
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={clearReceiveInvoiceSelection}
                      className="text-primary hover:underline"
                      disabled={receiveSubmitting || receiveSelectedDebitIds.length === 0}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              {receiveLedgerLoading ? (
                <p className="rounded-lg border border-border bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
                  Loading invoices…
                </p>
              ) : receiveUnpaidInvoices.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                  No open invoices for this member. You can still record an unallocated payment below.
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
                  <ul className="divide-y divide-border">
                    {receiveUnpaidInvoices.map((inv) => {
                      const checked = receiveSelectedDebitIds.includes(inv.id);
                      const ref = referenceLabel(inv);
                      const due = debitRemaining(inv);
                      const badge = entryStatusBadge(inv, debitLineStatus);
                      return (
                        <li key={inv.id}>
                          <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/50">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary"
                              checked={checked}
                              disabled={receiveSubmitting}
                              onChange={() => toggleReceiveInvoice(inv.id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-foreground">{ref}</span>
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {new Date(inv.created_at).toLocaleDateString(undefined, {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                                {' · '}
                                Due {CURRENCY} {formatMoney(due)}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Deposit to (chart-linked account)
            </label>
            <select
              aria-label="Deposit to cash or bank account"
              value={receiveBankAccountId}
              onChange={(e) => setReceiveBankAccountId(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-background px-4 py-3 text-foreground outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900/90"
              required
            >
              <option value="">Select cash or bank account</option>
              {depositAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.account_type ? ` (${a.account_type})` : ''}
                  {a.chart_code ? ` · ${a.chart_code}` : ''}
                </option>
              ))}
            </select>
            {depositAccounts.length === 0 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                No chart-linked cash/bank accounts found. Add one under shop bank accounts with a chart of accounts link.
              </p>
            )}
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Amount ({CURRENCY})
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={receiveAmount}
              onChange={(e) => setReceiveAmount(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-background px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900/90 dark:placeholder:text-gray-500"
              placeholder="0.00"
              required
            />
            {receiveSelectedDebitIds.length > 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Amount is the sum of selected invoices. Clear selection to enter a different amount (unallocated payment).
              </p>
            )}
          </div>
          {receivePaymentDescriptionPreview && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Payment description (saved on record)
              </div>
              <p className="mt-1 text-xs leading-relaxed text-emerald-900 dark:text-emerald-100">
                {receivePaymentDescriptionPreview}
              </p>
            </div>
          )}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Note (optional)</label>
            <input
              type="text"
              value={receiveNote}
              onChange={(e) => setReceiveNote(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-background px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900/90 dark:placeholder:text-gray-500"
              placeholder="e.g. Cash received"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setReceiveModalOpen(false);
                resetReceiveModalForm();
              }}
              disabled={receiveSubmitting}
              className="flex-1 rounded-xl border-2 border-border py-3 font-bold text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50 dark:border-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                receiveSubmitting ||
                !receiveCustomerId ||
                !receiveBankAccountId ||
                depositAccounts.length === 0 ||
                !receiveAmount ||
                parseFloat(receiveAmount) <= 0
              }
              className="flex-1 rounded-xl bg-violet-600 py-3 font-bold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-500"
            >
              {receiveSubmitting ? 'Saving…' : 'Record payment'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!editingEntry}
        onClose={() => !editSubmitting && setEditingEntry(null)}
        title="Edit khata entry"
        size="md"
      >
        {editingEntry && (
          <form onSubmit={handleSaveEdit} className="space-y-5">
            {editingEntry.order_id && editingEntry.sale_number && (
              <p className="text-xs text-muted-foreground">
                Linked sale: <span className="font-mono font-semibold text-foreground">{editingEntry.sale_number}</span>
              </p>
            )}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Type</label>
              <select
                aria-label="Entry type"
                value={editType}
                onChange={(e) => setEditType(e.target.value as 'debit' | 'credit')}
                className="w-full rounded-md border border-gray-200 bg-background px-4 py-3 text-foreground outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900/90"
              >
                <option value="debit">Debit (adds to balance)</option>
                <option value="credit">Credit (reduces balance)</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Amount ({CURRENCY})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                aria-label={`Amount (${CURRENCY})`}
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-background px-4 py-3 text-foreground outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900/90"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Note</label>
              <input
                type="text"
                aria-label="Note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-background px-4 py-3 text-foreground outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900/90"
                placeholder="Optional"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                disabled={editSubmitting}
                className="flex-1 rounded-xl border-2 border-border py-3 font-bold text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSubmitting || !editAmount || parseFloat(editAmount) <= 0}
                className="flex-1 rounded-md bg-violet-600 py-3 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {editSubmitting ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={overdueListModalOpen}
        onClose={() => setOverdueListModalOpen(false)}
        title={`Pending attention — over ${OVERDUE_AFTER_DAYS} days`}
        size="xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {overdueDebitRows.length} open invoice{overdueDebitRows.length === 1 ? '' : 's'} with balance due for more
            than {OVERDUE_AFTER_DAYS} days. Total due:{' '}
            <span className="font-mono font-bold text-foreground">
              {CURRENCY} {formatMoney(disputeValue)}
            </span>
          </p>
          {overdueDebitRows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              No overdue open debits right now.
            </p>
          ) : (
            <div className="max-h-[min(60vh,480px)] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-left text-xs leading-tight">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Member</th>
                    <th className="px-3 py-2">Invoice date</th>
                    <th className="px-3 py-2">Days overdue</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Amount due</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {overdueDebitRows.map(({ entry, memberName, daysOverdue, dueAmount, ref }) => {
                    const inv = khataEntrySaleInvoice(entry);
                    return (
                      <tr key={entry.id} className="hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setOverdueListModalOpen(false);
                              selectMember(entry.customer_id, memberName);
                            }}
                            className="font-semibold text-primary hover:underline"
                          >
                            {memberName}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {new Date(entry.created_at).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: '2-digit',
                          })}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-800 dark:bg-red-950/50 dark:text-red-300">
                            {daysOverdue}d
                          </span>
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2">
                          {inv ? (
                            <button
                              type="button"
                              onClick={() => {
                                setOverdueListModalOpen(false);
                                openSaleDetail(inv);
                              }}
                              className="truncate font-semibold text-blue-600 hover:underline dark:text-blue-400"
                              title={ref}
                            >
                              {ref}
                            </button>
                          ) : (
                            <span className="truncate text-blue-600 dark:text-blue-400" title={ref}>
                              {ref}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold tabular-nums text-foreground">
                          {CURRENCY} {formatMoney(dueAmount)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setOverdueListModalOpen(false);
                                selectMember(entry.customer_id, memberName);
                              }}
                              className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground hover:bg-muted"
                            >
                              Ledger
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOverdueListModalOpen(false);
                                openReceiveModalFromEntry(entry);
                              }}
                              className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-emerald-700"
                            >
                              Receive
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!entryPendingDelete}
        onClose={() => !deleteSubmitting && setEntryPendingDelete(null)}
        title="Delete entry?"
        size="sm"
      >
        {entryPendingDelete && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              This will remove the{' '}
              <span className="font-bold text-foreground">{entryPendingDelete.type === 'debit' ? 'Debit' : 'Credit'}</span> of{' '}
              <span className="font-mono font-bold text-foreground">
                {CURRENCY} {entryPendingDelete.amount.toLocaleString()}
              </span>{' '}
              from the ledger. Balances will update accordingly.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEntryPendingDelete(null)}
                disabled={deleteSubmitting}
                className="flex-1 rounded-xl border-2 border-border py-3 font-bold text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteSubmitting}
                className="flex-1 rounded-xl bg-rose-600 py-3 font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteSubmitting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default KhataPage;
