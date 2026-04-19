import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Mail,
  Download,
  Wallet,
  Filter,
  Pencil,
  Trash2,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { khataApi, KhataLedgerEntry, KhataSummaryRow, shopApi, ShopBankAccount } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Modal from '../../ui/Modal';
import { parsePakistanMobile } from '../../../utils/pakistanMobile';

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

/** WhatsApp / wa.me: digits only, no leading + */
function phoneDigitsForWhatsApp(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const pk = parsePakistanMobile(raw);
  if (pk.ok) return pk.digits;
  const d = raw.replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
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
  const [receiveApplyToLedgerId, setReceiveApplyToLedgerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<
    { id: string; name: string; contact_no: string | null; company_name?: string | null }[]
  >([]);
  const [directoryQuery, setDirectoryQuery] = useState('');
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

  const loadLedger = useCallback(async (customerId: string | null) => {
    if (!customerId) {
      setLedger([]);
      return;
    }
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
    void loadLedger(selectedCustomerId);
  }, [selectedCustomerId, loadLedger]);

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

  const contactById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

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
    return summary
      .filter((row) => {
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
      })
      .map((row) => {
        const openDebits = allLedger.filter(
          (e) => e.customer_id === row.customer_id && e.type === 'debit' && debitRemaining(e) > PAID_EPS
        );
        let maxOverdueDays = 0;
        for (const e of openDebits) {
          const age = daysSince(e.created_at);
          if (age > OVERDUE_AFTER_DAYS) maxOverdueDays = Math.max(maxOverdueDays, age - OVERDUE_AFTER_DAYS);
        }
        let status: { label: string; className: string };
        if (row.balance <= PAID_EPS) {
          status = {
            label: 'CURRENT',
            className: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
          };
        } else if (maxOverdueDays > 0) {
          status = {
            label: `OVERDUE (${maxOverdueDays}D)`,
            className: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40',
          };
        } else {
          status = {
            label: 'NET 30',
            className: 'text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800/80',
          };
        }
        return { ...row, status };
      });
  }, [summary, directoryQuery, contactById, allLedger]);

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

  const openReceiveModal = () => {
    setReceiveCustomerLocked(false);
    setReceiveApplyToLedgerId(null);
    setReceiveCustomerId('');
    setReceiveAmount('');
    setReceiveNote('');
    setReceiveBankAccountId('');
    setReceiveModalOpen(true);
  };

  const openReceiveModalForCurrentCustomer = () => {
    if (!selectedCustomerId) return;
    setReceiveCustomerLocked(true);
    setReceiveApplyToLedgerId(null);
    setReceiveCustomerId(selectedCustomerId);
    setReceiveAmount('');
    setReceiveNote('');
    setReceiveBankAccountId('');
    setReceiveModalOpen(true);
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
    setReceiveApplyToLedgerId(entry.id);
    setReceiveCustomerId(cid);
    const due =
      typeof entry.remaining_debit === 'number' && Number.isFinite(entry.remaining_debit)
        ? Math.max(0, entry.remaining_debit)
        : entry.amount;
    setReceiveAmount(String(due));
    setReceiveNote(noteFromLedgerEntry(entry));
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
    setReceiveSubmitting(true);
    try {
      await khataApi.receivePayment({
        customerId: receiveCustomerId,
        amount,
        bankAccountId: receiveBankAccountId,
        note: receiveNote.trim() || undefined,
        ...(receiveApplyToLedgerId ? { applyToLedgerId: receiveApplyToLedgerId } : {}),
      });
      setReceiveModalOpen(false);
      setReceiveCustomerId('');
      setReceiveAmount('');
      setReceiveNote('');
      setReceiveBankAccountId('');
      setReceiveCustomerLocked(false);
      setReceiveApplyToLedgerId(null);
      await refreshSummaryAndLedger();
      void loadCustomers();
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
    const phone = phoneDigitsForWhatsApp(selectedContact?.contact_no ?? null);
    if (!phone) {
      alert(
        'This customer needs a valid mobile number (Pakistan 03… or 923…) on their contact record to open WhatsApp.'
      );
      return;
    }
    const closing = customerFooter?.balance ?? summary.find((s) => s.customer_id === selectedCustomerId)?.balance ?? 0;
    const text = buildWhatsappStatementMessage(selectedCustomerName, closing, ledger);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pending attention
              </div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {disputeCount}
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                Open debits over {OVERDUE_AFTER_DAYS}d: {CURRENCY} {formatMoney(disputeValue)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto flex max-w-[1600px] min-h-[480px] gap-6 lg:gap-8">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600 dark:border-violet-950 dark:border-t-violet-400" />
            </div>
          ) : (
            <>
              {/* Client directory */}
              <aside className="flex w-full shrink-0 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:w-[340px]">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Client Directory</h2>
                  <button
                    type="button"
                    onClick={() => setDirectoryQuery('')}
                    className="text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400"
                  >
                    View All
                  </button>
                </div>
                <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                  <div className="relative">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={directoryQuery}
                      onChange={(e) => setDirectoryQuery(e.target.value)}
                      placeholder="Filter by name or credit limit…"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-violet-500/30 placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white"
                    />
                  </div>
                </div>
                <ul className="max-h-[calc(100vh-280px)] min-h-[320px] overflow-y-auto">
                  {directoryRows.length === 0 ? (
                    <li className="px-5 py-12 text-center text-sm text-slate-500">No matching clients with khata activity.</li>
                  ) : (
                    directoryRows.map((row) => (
                      <li key={row.customer_id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomerId(row.customer_id);
                            setSelectedCustomerName(row.customer_name);
                          }}
                          className={`flex w-full items-start gap-3 border-l-4 px-4 py-3.5 text-left transition-colors ${
                            selectedCustomerId === row.customer_id
                              ? 'border-violet-600 bg-violet-50/90 dark:border-violet-500 dark:bg-violet-950/40'
                              : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                            {initials(row.customer_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-slate-900 dark:text-white">{row.customer_name}</div>
                            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{clientCode(row.customer_id)}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-bold tabular-nums text-slate-800 dark:text-slate-200">
                                {CURRENCY} {formatMoney(row.balance)}
                              </span>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${row.status.className}`}
                              >
                                {row.status.label}
                              </span>
                            </div>
                          </div>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </aside>

              {/* Ledger detail */}
              <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {!selectedCustomerId ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
                    <p className="text-slate-500 dark:text-slate-400">Select a client to view the full khata ledger.</p>
                  </div>
                ) : (
                  <>
                    <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800 md:px-8 md:py-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white md:text-2xl">
                              {selectedCustomerName}
                            </h1>
                            {highRisk && (
                              <span className="rounded-full bg-red-100 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-red-800 dark:bg-red-950/60 dark:text-red-300">
                                High risk
                              </span>
                            )}
                          </div>
                          <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tax ID</div>
                              <div className="mt-1 text-slate-700 dark:text-slate-300">—</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Payment terms</div>
                              <div className="mt-1 text-slate-700 dark:text-slate-300">On account</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contact</div>
                              <div className="mt-1 text-slate-700 dark:text-slate-300">
                                {selectedContact?.name || selectedCustomerName}
                                {selectedContact?.contact_no && (
                                  <>
                                    {' · '}
                                    <span className="text-violet-600 dark:text-violet-400">{selectedContact.contact_no}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={sendStatementWhatsApp}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Mail className="h-4 w-4" />
                            Send Statement
                          </button>
                          <button
                            type="button"
                            onClick={exportLedgerCsv}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Download className="h-4 w-4" />
                            Export
                          </button>
                          <button
                            type="button"
                            onClick={openReceiveModalForCurrentCustomer}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600"
                          >
                            <Wallet className="h-4 w-4" />
                            Receive Payment
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-x-auto">
                      {ledger.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-500">No transactions for this customer.</div>
                      ) : (
                        <table className="w-full min-w-[720px] text-left text-sm">
                          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/95 dark:text-slate-400">
                            <tr>
                              <th className="px-6 py-3">Date</th>
                              <th className="px-4 py-3">Type</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Reference</th>
                              <th className="px-4 py-3 text-right">Amount</th>
                              <th className="w-[1%] whitespace-nowrap px-6 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {ledger.map((entry) => {
                              const badge = entryStatusBadge(entry, debitLineStatus);
                              const ref = referenceLabel(entry);
                              const inv = khataEntrySaleInvoice(entry);
                              const typ = rowDisplayType(entry);
                              return (
                                <tr key={entry.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                  <td className="whitespace-nowrap px-6 py-3 text-slate-600 dark:text-slate-400">
                                    {new Date(entry.created_at).toLocaleDateString(undefined, {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </td>
                                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{typ}</td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className="max-w-[220px] px-4 py-3 text-slate-600 dark:text-slate-400">
                                    {inv ? (
                                      <button
                                        type="button"
                                        onClick={() => openSaleDetail(inv)}
                                        className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                                      >
                                        {ref}
                                      </button>
                                    ) : (
                                      <span className="font-medium text-blue-600 dark:text-blue-400">{ref}</span>
                                    )}
                                  </td>
                                  <td
                                    className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${
                                      entry.type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {entry.type === 'debit' ? '+' : '−'}
                                    {CURRENCY} {formatMoney(entry.amount)}
                                    {entry.type === 'debit' && debitLineStatus(entry) !== 'paid' && (
                                      <div className="mt-0.5 text-[10px] font-normal text-slate-500">
                                        Due {CURRENCY} {formatMoney(debitRemaining(entry))}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-3 text-right">
                                    <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                      {entry.type === 'debit' && debitLineStatus(entry) !== 'paid' && (
                                        <button
                                          type="button"
                                          onClick={() => openReceiveModalFromEntry(entry)}
                                          className="mr-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-emerald-700"
                                        >
                                          Receive
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => openEditEntry(entry)}
                                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/40 dark:hover:text-violet-400"
                                        title="Edit entry"
                                        aria-label="Edit entry"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEntryPendingDelete(entry)}
                                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                                        title="Delete entry"
                                        aria-label="Delete entry"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {customerFooter && (
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
                  </>
                )}
              </section>
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
          setReceiveCustomerLocked(false);
          setReceiveApplyToLedgerId(null);
        }}
        title="Receive Payment"
        size="md"
      >
        <form onSubmit={handleReceivePayment} className="space-y-5">
          {receiveCustomerLocked && selectedCustomerName && (
            <p className="rounded-lg border border-border bg-muted/80 px-3 py-2 text-xs text-muted-foreground">
              Ledger: <span className="font-bold text-foreground">{selectedCustomerName}</span>
              {receiveApplyToLedgerId ? (
                <span className="mt-1 block font-semibold text-emerald-700 dark:text-emerald-400">
                  This payment will settle the selected debit line (partial or full).
                </span>
              ) : null}
              {receiveAmount ? (
                <>
                  {' · '}
                  {receiveApplyToLedgerId ? 'Amount (due on line): ' : 'Amount: '}
                  {CURRENCY} {receiveAmount}
                </>
              ) : (
                ' — choose deposit account and amount below.'
              )}
            </p>
          )}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Customer</label>
            <select
              aria-label="Select customer"
              value={receiveCustomerId}
              onChange={(e) => setReceiveCustomerId(e.target.value)}
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
          </div>
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
                setReceiveCustomerLocked(false);
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
