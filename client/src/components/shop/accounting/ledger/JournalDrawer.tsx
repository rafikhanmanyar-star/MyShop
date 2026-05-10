import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Printer,
  FileDown,
  RotateCcw,
  Pencil,
  X,
} from 'lucide-react';
import type { LedgerJournalEntry } from './types';
import { JournalLinesTable, type DisplayLine } from './JournalLinesTable';
import { SourceBadge } from './SourceBadge';
import { ledgerLineTotals } from './LedgerToolbar';
import { downloadJournalPdf } from './journalPdf';
import { printJournalEntry } from './printJournal';

interface JournalDrawerProps {
  entry: LedgerJournalEntry | null;
  open: boolean;
  onClose: () => void;
  storeLabel?: string;
  createdByFallback?: string;
  isAdmin: boolean;
  onEdit: () => void;
}

function statusTone(status?: string | null) {
  const s = String(status || '').toLowerCase();
  if (s === 'posted') return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300';
  if (s === 'draft') return 'bg-amber-100 text-amber-900 dark:bg-amber-950/55 dark:text-amber-300';
  return 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100';
}

export const JournalDrawer: React.FC<JournalDrawerProps> = ({
  entry,
  open,
  onClose,
  storeLabel,
  createdByFallback,
  isAdmin,
  onEdit,
}) => {
  const { debit: td, credit: tc } = entry ? ledgerLineTotals(entry) : { debit: 0, credit: 0 };

  const displayLines: DisplayLine[] =
    entry?.lines?.map((l) => ({
      ...l,
      label: `${l.accountCode || ''} — ${l.accountName || ''}`,
    })) || [];

  /** Lock scroll while drawer content is mounted (animating open or shut). */
  useEffect(() => {
    if (!entry) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [entry]);

  useEffect(() => {
    if (!entry) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [entry, onClose]);

  if (!entry) return null;

  const dateDisp =
    typeof entry.date === 'string' ? entry.date.slice(0, 10) : new Date(entry.date).toISOString().slice(0, 10);

  const handlePrint = () => {
    printJournalEntry(entry, { storeLabel });
  };

  const handlePdf = () => {
    downloadJournalPdf(entry, { storeLabel, createdBy: createdByFallback });
  };

  return (
    <>
      <motion.button
        type="button"
        aria-label="Close journal details backdrop"
        className="fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[2px]"
        aria-hidden={!open}
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.22 }}
        style={{ pointerEvents: open ? 'auto' : 'none' }}
        onClick={onClose}
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-drawer-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-white shadow-2xl dark:bg-[#111827] dark:shadow-black/40"
        initial={false}
        animate={{ x: open ? 0 : '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 36 }}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-[#E5E7EB] px-6 py-5 dark:border-[#1F2937]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p
                id="journal-drawer-title"
                className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground dark:text-[#94A3B8]"
              >
                Journal details
              </p>
              <h2 className="mt-1 truncate text-xl font-bold text-foreground dark:text-[#E5E7EB]" title={entry.reference}>
                {entry.reference}
              </h2>
              <span
                className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(entry.status)}`}
              >
                {entry.status || 'Posted'}
              </span>
            </div>
            <button
              type="button"
              aria-label="Close"
              className="rounded-xl border border-[#E5E7EB] p-2 text-muted-foreground transition-colors hover:bg-muted dark:border-[#1F2937] dark:hover:bg-slate-800"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <section className="space-y-3 pb-8">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground dark:text-[#94A3B8]">
              Transaction
            </h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground dark:text-[#94A3B8]">Date</dt>
                <dd className="font-medium tabular-nums text-foreground dark:text-[#E5E7EB]">{dateDisp}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground dark:text-[#94A3B8]">Source</dt>
                <dd className="mt-1">
                  <SourceBadge source={entry.sourceModule} />
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground dark:text-[#94A3B8]">Recorded</dt>
                <dd className="font-medium text-foreground dark:text-[#E5E7EB]">
                  {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : createdByFallback || '—'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground dark:text-[#94A3B8]">Store context</dt>
                <dd className="font-medium text-foreground dark:text-[#E5E7EB]">{storeLabel ?? 'Tenant default'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground dark:text-[#94A3B8]">Notes</dt>
                <dd className="text-sm text-foreground dark:text-[#E5E7EB]">{entry.description?.trim() || '—'}</dd>
              </div>
            </dl>
          </section>

          <div className="my-8 h-px bg-[#E5E7EB] dark:bg-[#1F2937]" />

          <section className="space-y-3 pb-6">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground dark:text-[#94A3B8]">
              Journal lines
            </h3>
            <JournalLinesTable lines={displayLines} />
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-[#F6F8FC]/80 px-5 py-4 dark:border-[#1F2937] dark:bg-[#0F172A]/55">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground dark:text-[#94A3B8]">Summary</h3>
            <div className="mt-3 flex flex-wrap gap-8 tabular-nums">
              <div>
                <p className="text-xs text-muted-foreground dark:text-[#94A3B8]">Total debit</p>
                <p className="text-lg font-bold text-foreground dark:text-[#E5E7EB]">{td.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground dark:text-[#94A3B8]">Total credit</p>
                <p className="text-lg font-bold text-foreground dark:text-[#E5E7EB]">{tc.toLocaleString()}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#E5E7EB] bg-white/95 px-6 py-4 backdrop-blur dark:border-[#1F2937] dark:bg-[#111827]/95">
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => onEdit()}
                className="inline-flex min-w-[7rem] flex-1 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-semibold text-foreground hover:border-indigo-300 hover:bg-indigo-50 dark:border-[#1F2937] dark:bg-slate-800 dark:hover:bg-indigo-950/40"
              >
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </button>
            )}
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Reversals are not configured for this ledger yet."
              className="inline-flex min-w-[7rem] flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-muted-foreground opacity-60 dark:border-[#1F2937]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Reverse entry
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex min-w-[7rem] flex-1 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted dark:border-[#1F2937] dark:bg-slate-800"
            >
              <Printer className="h-4 w-4" aria-hidden /> Print
            </button>
            <button
              type="button"
              onClick={handlePdf}
              className="inline-flex min-w-[7rem] flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <FileDown className="h-4 w-4" aria-hidden /> Export PDF
            </button>
          </div>
        </div>
      </motion.aside>
    </>
  );
};
