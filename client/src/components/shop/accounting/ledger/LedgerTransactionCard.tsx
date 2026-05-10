import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { LedgerJournalEntry } from './types';
import { SourceBadge } from './SourceBadge';
import { ledgerLineTotals } from './LedgerToolbar';

interface LedgerTransactionCardProps {
  entry: LedgerJournalEntry;
  selected: boolean;
  isAdmin: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function formatAmt(n: number) {
  if (n > 0) return n.toLocaleString();
  return '—';
}

export const LedgerTransactionCard: React.FC<LedgerTransactionCardProps> = ({
  entry,
  selected,
  isAdmin,
  onOpen,
  onEdit,
  onDelete,
}) => {
  const { debit: td, credit: tc } = ledgerLineTotals(entry);
  const lineCount = (entry.lines || []).length;
  const dateStr = typeof entry.date === 'string' ? entry.date.slice(0, 10) : new Date(entry.date).toISOString().slice(0, 10);
  const readable = () => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Journal ${entry.reference}, ${readable()}, open details`}
      whileHover={{
        scale: 1.005,
        boxShadow: '0 14px 40px -14px rgba(15,23,42,0.18)',
      }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className={`relative grid cursor-pointer grid-cols-1 gap-4 rounded-2xl border bg-white p-5 shadow-[0_6px_20px_-8px_rgba(15,23,42,0.1)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-[#111827] lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center ${
        selected
          ? 'border-indigo-400 ring-2 ring-indigo-500/20 dark:border-indigo-500/60'
          : 'border-[#E5E7EB] hover:border-indigo-300/70 dark:border-[#1F2937] dark:hover:border-indigo-600/45'
      }`}
    >
      <div className="flex min-w-0 gap-4">
        <div className={`mt-1 flex shrink-0 text-muted-foreground transition-transform duration-200 ${selected ? 'rotate-90' : ''}`}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
            <span className="truncate font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400" title={entry.reference}>
              {entry.reference}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground dark:text-[#94A3B8]">{readable()}</span>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground dark:text-[#94A3B8]" title={entry.description || undefined}>
            {entry.description?.trim() || '—'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:justify-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-[#94A3B8]">
          {lineCount} line{lineCount === 1 ? '' : 's'}
        </span>
        <SourceBadge source={entry.sourceModule} />
      </div>

      <div className="flex flex-row flex-wrap items-center justify-between gap-4 lg:justify-end">
        <div className="flex flex-wrap gap-6 tabular-nums">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground dark:text-[#94A3B8]">Debit</p>
            <p className="text-sm font-bold text-foreground dark:text-[#E5E7EB]">{formatAmt(td)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground dark:text-[#94A3B8]">Credit</p>
            <p className="text-sm font-bold text-muted-foreground dark:text-[#94A3B8]">{formatAmt(tc)}</p>
          </div>
        </div>
        {isAdmin ? (
          <div className="flex items-center gap-1 rounded-xl border border-[#E5E7EB] bg-muted/40 p-1 dark:border-[#1F2937]" onClick={(e) => e.stopPropagation()} role="presentation">
            <button
              type="button"
              aria-label={`Edit journal ${entry.reference}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950/70 dark:hover:text-indigo-300"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Delete journal ${entry.reference}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
};
