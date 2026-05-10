import React from 'react';
import type { LedgerJournalEntry } from './types';

export type NormalizedLedgerSource =
  | 'POS'
  | 'MOBILE'
  | 'PURCHASE'
  | 'MANUAL'
  | 'OTHER';

export function normalizeSource(source: LedgerJournalEntry['sourceModule'] | string | undefined | null): NormalizedLedgerSource {
  const s = String(source || '').trim();
  if (s === 'POS') return 'POS';
  if (s === 'MobileApp') return 'MOBILE';
  if (s === 'Manual') return 'MANUAL';
  if (s === 'Purchases' || s.toLowerCase().includes('purchase')) return 'PURCHASE';
  return 'OTHER';
}

const styles: Record<NormalizedLedgerSource, string> = {
  POS: 'bg-violet-100 text-violet-800 ring-violet-200/70 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-800/50',
  MOBILE: 'bg-blue-100 text-blue-800 ring-blue-200/70 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800/50',
  PURCHASE: 'bg-amber-100 text-amber-900 ring-amber-200/70 dark:bg-amber-950/45 dark:text-amber-300 dark:ring-amber-800/50',
  MANUAL: 'bg-slate-200 text-slate-800 ring-slate-300/70 dark:bg-slate-700/70 dark:text-slate-100 dark:ring-slate-600/50',
  OTHER: 'bg-slate-100 text-slate-700 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-600/50',
};

const labels: Record<NormalizedLedgerSource, string> = {
  POS: 'POS',
  MOBILE: 'MOBILE',
  PURCHASE: 'PURCHASE',
  MANUAL: 'MANUAL',
  OTHER: 'OTHER',
};

interface SourceBadgeProps {
  source: LedgerJournalEntry['sourceModule'] | string | undefined | null;
  className?: string;
}

/** Colored pill for journal source (POS / mobile / procurement / manual). */
export const SourceBadge: React.FC<SourceBadgeProps> = ({ source, className = '' }) => {
  const n = normalizeSource(source);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${styles[n]} ${className}`}
    >
      {n === 'MOBILE' ? 'Mobile' : n === 'PURCHASE' ? 'Purchase' : labels[n]}
    </span>
  );
};
