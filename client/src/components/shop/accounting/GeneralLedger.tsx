
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAccounting } from '../../../context/AccountingContext';
import { useAuth } from '../../../context/AuthContext';
import { useBranch } from '../../../context/BranchContext';
import { accountingApi } from '../../../services/shopApi';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Button from '../../ui/Button';
import { JournalDrawer } from './ledger/JournalDrawer';
import { LedgerToolbar, ledgerLineTotals } from './ledger/LedgerToolbar';
import { LedgerTransactionCard } from './ledger/LedgerTransactionCard';
import { EmptyLedgerState } from './ledger/EmptyLedgerState';
import { LedgerSkeleton } from './ledger/LedgerSkeleton';
import type { LedgerJournalEntry, LedgerSortId } from './ledger/types';
import type { LedgerSourceFilter } from './ledger/types';

type EditFormLine = { accountId: string; description?: string; debit: number; credit: number };

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

function entryDay(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

function escapeCsvField(v: string) {
  if (/[,"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadCsv(filename: string, rows: string[][]) {
  const body = rows.map((r) => r.map((c) => escapeCsvField(String(c))).join(',')).join('\r\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildLedgerCsv(entries: LedgerJournalEntry[]) {
  const head = [
    'reference',
    'date',
    'description',
    'source',
    'account_code',
    'account_name',
    'debit',
    'credit',
    'entry_total_debit',
    'entry_total_credit',
  ];
  const body: string[][] = [head];
  for (const e of entries) {
    const { debit: td, credit: tc } = ledgerLineTotals(e);
    const dt = entryDay(e.date);
    const lines = e.lines?.length ? e.lines : [{ accountCode: '', accountName: '', debit: 0, credit: 0, accountId: '' }];
    for (const l of lines) {
      body.push([
        e.reference || '',
        dt,
        String(e.description || ''),
        String(e.sourceModule || ''),
        String(l.accountCode || ''),
        String(l.accountName || ''),
        Number(l.debit || 0) > 0 ? String(l.debit) : '',
        Number(l.credit || 0) > 0 ? String(l.credit) : '',
        String(td),
        String(tc),
      ]);
    }
  }
  return body;
}

export interface GeneralLedgerProps {
  onExportCsvReady?: (fn: () => void) => void;
  /** Optional: parent can wire header “Manual Journal” shortcut */
  onRequestManualJournal?: () => void;
}

const DRAWERUnmount_MS = 400;

const GeneralLedger: React.FC<GeneralLedgerProps> = ({ onExportCsvReady, onRequestManualJournal }) => {
  const { user } = useAuth();
  const { accounts, updateJournalEntry, deleteJournalEntry } = useAccounting();
  const branchCtx = useBranch();
  const isAdmin = user?.role === 'admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<LedgerSourceFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(100);
  const [ledgerItems, setLedgerItems] = useState<LedgerJournalEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [sort, setSort] = useState<LedgerSortId>('date-desc');

  const [editingEntry, setEditingEntry] = useState<LedgerJournalEntry | null>(null);
  const [editForm, setEditForm] = useState<{ date: string; reference: string; description: string; lines: EditFormLine[] }>({
    date: '',
    reference: '',
    description: '',
    lines: [],
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [drawerEntry, setDrawerEntry] = useState<LedgerJournalEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [ledgerRefreshTick, setLedgerRefreshTick] = useState(0);

  const openDrawerFor = useCallback((e: LedgerJournalEntry) => {
    setDrawerEntry(e);
    setSelectedId(e.id);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    window.setTimeout(() => {
      setDrawerEntry(null);
      setSelectedId(null);
    }, DRAWERUnmount_MS);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sourceFilter, pageSize, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLedgerLoading(true);
      try {
        const res = await accountingApi.getJournalEntriesPage({
          page,
          limit: pageSize,
          search: debouncedSearch || undefined,
          sourceModule: sourceFilter,
          dateFrom: dateFrom?.trim() || undefined,
          dateTo: dateTo?.trim() || undefined,
        });
        if (cancelled) return;
        const total = res.total ?? 0;
        const computedTotalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = page > computedTotalPages && total > 0 ? computedTotalPages : page;
        if (safePage !== page) {
          if (!cancelled) setLedgerLoading(false);
          if (!cancelled) setPage(safePage);
          return;
        }
        setLedgerItems((res.items ?? []) as LedgerJournalEntry[]);
        setLedgerTotal(total);
      } catch {
        if (!cancelled) {
          setLedgerItems([]);
          setLedgerTotal(0);
        }
      } finally {
        if (!cancelled) setLedgerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, debouncedSearch, sourceFilter, dateFrom, dateTo, ledgerRefreshTick]);

  const processedItems = useMemo(() => {
    let rows = ledgerItems.slice();
    if (accountFilter && rows.length) {
      rows = rows.filter((e) => (e.lines || []).some((l) => l.accountId === accountFilter));
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'date-asc': {
          const da = entryDay(a.date);
          const db = entryDay(b.date);
          return da.localeCompare(db);
        }
        case 'reference-asc':
          return (a.reference || '').localeCompare(b.reference || '');
        case 'debit-desc': {
          const da = ledgerLineTotals(a).debit;
          const db = ledgerLineTotals(b).debit;
          return db - da;
        }
        case 'date-desc':
        default:
          return entryDay(b.date).localeCompare(entryDay(a.date));
      }
    });
    return sorted;
  }, [ledgerItems, accountFilter, sort]);

  const clientFilterNotice = accountFilter
    ? 'Account filter narrows entries on this page only. Clearing it shows all rows returned for the selected date range and server filters.'
    : null;

  const exportCsvNow = useCallback(() => {
    const rows = buildLedgerCsv(processedItems);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadCsv(`general-ledger-page-${stamp}.csv`, rows);
  }, [processedItems]);

  useEffect(() => {
    onExportCsvReady?.(exportCsvNow);
  }, [onExportCsvReady, exportCsvNow]);

  const totalPages = Math.max(1, Math.ceil(ledgerTotal / pageSize));
  const rangeStart = ledgerTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, ledgerTotal);

  const branchOptions = branchCtx.branches || [];
  const handleBranchPick = useCallback(
    (id: string) => {
      if (branchOptions.some((b) => b.id === id)) branchCtx.setBranch(id);
    },
    [branchCtx, branchOptions]
  );

  const openEditModal = (entry: LedgerJournalEntry) => {
    closeDrawer();
    const dateStr = typeof entry.date === 'string' ? entry.date.slice(0, 10) : new Date(entry.date).toISOString().slice(0, 10);
    const mappedLines = (entry.lines || []).map((l) => ({
      accountId: l.accountId,
      description: '',
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    }));
    const lines =
      mappedLines.length >= 2
        ? mappedLines
        : [...mappedLines, ...Array.from({ length: Math.max(0, 2 - mappedLines.length) }, () => ({ accountId: '', description: '', debit: 0, credit: 0 }))];
    setEditingEntry(entry);
    setEditForm({
      date: dateStr,
      reference: entry.reference || '',
      description: entry.description || '',
      lines,
    });
  };

  const handleEditLineChange = (index: number, field: keyof EditFormLine, value: unknown) => {
    const newLines = [...editForm.lines];
    newLines[index] = { ...newLines[index], [field]: value } as EditFormLine;
    setEditForm((prev) => ({ ...prev, lines: newLines }));
  };

  const handleAddEditLine = () => {
    setEditForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { accountId: '', description: '', debit: 0, credit: 0 }],
    }));
  };

  const handleRemoveEditLine = (index: number) => {
    if (editForm.lines.length <= 2) return;
    setEditForm((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  };

  const totalDebit = editForm.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = editForm.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isEditBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const handleSaveEdit = async () => {
    if (!editingEntry || !isEditBalanced) return;
    setActionLoading(true);
    try {
      await updateJournalEntry(editingEntry.id, {
        date: editForm.date,
        reference: editForm.reference,
        description: editForm.description,
        lines: editForm.lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit),
          credit: Number(l.credit),
          description: l.description,
        })),
      });
      setEditingEntry(null);
      setLedgerRefreshTick((t) => t + 1);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update entry');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setActionLoading(true);
    try {
      await deleteJournalEntry(deleteConfirmId);
      setDeleteConfirmId(null);
      closeDrawer();
      setLedgerRefreshTick((t) => t + 1);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete entry');
    } finally {
      setActionLoading(false);
    }
  };

  const entryRangeLabel =
    ledgerTotal === 0
      ? `0 loaded · Page ${page} / ${totalPages}`
      : `Server rows ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} · ${processedItems.length} visible`;

  const accountPicker = useMemo(() => accounts.map((a: { id: string; code: string; name: string }) => ({ id: a.id, code: a.code, name: a.name })), [accounts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <LedgerToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        sourceFilter={sourceFilter}
        onSourceChange={setSourceFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        accountId={accountFilter}
        onAccountIdChange={setAccountFilter}
        accounts={accountPicker}
        sort={sort}
        onSortChange={setSort}
        entryCountLabel={entryRangeLabel}
        clientFilterNotice={clientFilterNotice}
        branches={branchOptions}
        selectedBranchId={branchCtx.selectedBranchId}
        onBranchChange={handleBranchPick}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div aria-label="Journal entries" className="space-y-2 pb-6">
          {ledgerLoading ? (
            <LedgerSkeleton />
          ) : processedItems.length === 0 ? (
            <EmptyLedgerState onManualJournal={onRequestManualJournal} />
          ) : (
            <AnimatePresence initial={false}>
              {processedItems.map((entry, idx) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(idx * 0.03, 0.24), ease: 'easeOut' }}
                >
                  <LedgerTransactionCard
                    entry={entry}
                    selected={selectedId === entry.id && drawerOpen}
                    isAdmin={isAdmin}
                    onOpen={() => openDrawerFor(entry)}
                    onEdit={() => openEditModal(entry)}
                    onDelete={() => setDeleteConfirmId(entry.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {!ledgerLoading && ledgerTotal > 0 ? (
        <div className="flex shrink-0 flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 dark:border-[#1F2937] dark:bg-[#111827] sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-semibold tabular-nums text-muted-foreground dark:text-[#94A3B8]">
            Page <span className="font-bold text-foreground dark:text-[#E5E7EB]">{page}</span> of{' '}
            <span className="font-bold text-foreground dark:text-[#E5E7EB]">{totalPages}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground dark:text-[#94A3B8]">
              <span>Rows per page</span>
              <select
                value={pageSize}
                aria-label="Rows per page"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) setPageSize(n as (typeof PAGE_SIZE_OPTIONS)[number]);
                }}
                className="rounded-xl border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs font-bold dark:border-[#1F2937] dark:bg-[#0F172A] dark:text-[#E5E7EB]"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1 || ledgerLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40 dark:border-[#1F2937] dark:bg-slate-800"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || ledgerLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40 dark:border-[#1F2937] dark:bg-slate-800"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <JournalDrawer
        entry={drawerEntry}
        open={drawerOpen}
        onClose={closeDrawer}
        storeLabel={branchCtx.selectedBranchName}
        createdByFallback="System posting"
        isAdmin={isAdmin}
        onEdit={() => {
          if (!drawerEntry) return;
          openEditModal(drawerEntry);
        }}
      />

      <Modal isOpen={!!editingEntry} onClose={() => setEditingEntry(null)} title="Edit Ledger Entry" size="xl">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Input label="Date" type="date" value={editForm.date} onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))} />
            <Input
              label="Reference #"
              placeholder="e.g. ADJ-001"
              value={editForm.reference}
              onChange={(e) => setEditForm((prev) => ({ ...prev, reference: e.target.value }))}
            />
            <Input
              label="Description"
              placeholder="Reason for entry..."
              value={editForm.description}
              onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-border dark:border-slate-700 dark:bg-slate-800/60">
            <table className="w-full text-left">
              <thead className="bg-muted text-xs font-semibold uppercase text-muted-foreground dark:bg-slate-800">
                <tr>
                  <th className="w-[30%] px-4 py-3">Account</th>
                  <th className="w-[30%] px-4 py-3">Description</th>
                  <th className="w-[15%] px-4 py-3 text-right">Debit</th>
                  <th className="w-[15%] px-4 py-3 text-right">Credit</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {editForm.lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2">
                      <Select
                        value={line.accountId}
                        onChange={(e) => handleEditLineChange(idx, 'accountId', e.target.value)}
                        className="w-full border-none bg-transparent text-xs font-bold focus:ring-0"
                        hideIcon
                      >
                        <option value="">Select Account</option>
                        {accounts.map((acc: { id: string; code: string; name: string }) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        placeholder="Line description"
                        className="w-full border-none bg-transparent text-xs focus:ring-0 dark:text-slate-100"
                        value={line.description || ''}
                        onChange={(e) => handleEditLineChange(idx, 'description', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        aria-label={`Line ${idx + 1} debit`}
                        className="w-full border-none bg-transparent text-right font-mono text-sm focus:ring-0 dark:text-slate-100"
                        value={line.debit}
                        onChange={(e) => handleEditLineChange(idx, 'debit', e.target.value)}
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        aria-label={`Line ${idx + 1} credit`}
                        className="w-full border-none bg-transparent text-right font-mono text-sm focus:ring-0 dark:text-slate-100"
                        value={line.credit}
                        onChange={(e) => handleEditLineChange(idx, 'credit', e.target.value)}
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button type="button" onClick={() => handleRemoveEditLine(idx)} disabled={editForm.lines.length <= 2} className="text-muted-foreground hover:text-rose-500 disabled:opacity-30">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-muted/80 font-bold text-xs dark:border-slate-700 dark:bg-slate-800">
                <tr>
                  <td colSpan={2} className="px-4 py-3">
                    <button type="button" onClick={handleAddEditLine} className="text-indigo-600 hover:underline dark:text-indigo-400">
                      + Add Line
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{totalDebit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono">{totalCredit.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div className={`text-sm font-bold ${isEditBalanced ? 'text-emerald-600' : 'text-rose-500'}`}>
              {isEditBalanced ? 'Balanced' : `Unbalanced Difference: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setEditingEntry(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={!isEditBalanced || editForm.lines.some((l) => !l.accountId) || actionLoading}
              >
                {actionLoading ? 'Saving...' : 'Update Entry'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} title="Delete Ledger Entry" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This removes the journal entry and its posting lines from the ledger and updates balances. This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleDeleteConfirm} disabled={actionLoading} className="bg-rose-600 hover:bg-rose-700">
              {actionLoading ? 'Deleting...' : 'Delete Entry'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default GeneralLedger;
