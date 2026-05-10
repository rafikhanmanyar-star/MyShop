import React, { useId, useState } from 'react';
import { Search, ChevronDown, ChevronUp, Building2 } from 'lucide-react';
import type { LedgerJournalEntry } from './types';
import type { LedgerSortId } from './types';
import type { LedgerSourceFilter } from './types';

const SOURCE_CHIPS: { id: LedgerSourceFilter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'POS', label: 'POS' },
  { id: 'MobileApp', label: 'MOBILE' },
  { id: 'Manual', label: 'MANUAL' },
];

const SORT_OPTS: { id: LedgerSortId; label: string }[] = [
  { id: 'date-desc', label: 'Newest date' },
  { id: 'date-asc', label: 'Oldest date' },
  { id: 'reference-asc', label: 'Reference A–Z' },
  { id: 'debit-desc', label: 'Highest debit' },
];

export interface LedgerToolbarProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  sourceFilter: LedgerSourceFilter;
  onSourceChange: (v: LedgerSourceFilter) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  /** Account UUID or empty for any */
  accountId: string;
  onAccountIdChange: (v: string) => void;
  accounts: Array<{ id: string; code: string; name: string }>;
  sort: LedgerSortId;
  onSortChange: (v: LedgerSortId) => void;
  entryCountLabel: string;
  clientFilterNotice?: string | null;
  /** Branch picker — switches active store context app-wide */
  branches: Array<{ id: string; name: string }>;
  selectedBranchId: string | null;
  onBranchChange: (branchId: string) => void;
}

export const LedgerToolbar: React.FC<LedgerToolbarProps> = ({
  searchTerm,
  onSearchChange,
  sourceFilter,
  onSourceChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  accountId,
  onAccountIdChange,
  accounts,
  sort,
  onSortChange,
  entryCountLabel,
  clientFilterNotice,
  branches,
  selectedBranchId,
  onBranchChange,
}) => {
  const searchId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white/90 p-3 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-[#1F2937] dark:bg-[#111827]/95">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 sm:min-w-[220px] sm:max-w-sm">
              <label htmlFor={searchId} className="sr-only">
                Search ledger
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground dark:text-[#94A3B8]"
                aria-hidden
              />
              <input
                id={searchId}
                type="search"
                placeholder="Search reference, description…"
                autoComplete="off"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] bg-white py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-[#1F2937] dark:bg-[#0F172A] dark:text-[#E5E7EB]"
              />
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-foreground lg:hidden dark:border-[#1F2937]"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              Filters {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Filter chips */}
          <div className={`flex flex-wrap gap-2 ${filtersOpen ? '' : 'hidden lg:flex'}`}>
            {SOURCE_CHIPS.map((chip) => {
              const active = sourceFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onSourceChange(chip.id)}
                  aria-pressed={active}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                      : 'bg-slate-100 text-muted-foreground hover:bg-slate-200/90 dark:bg-slate-800 dark:text-[#94A3B8] dark:hover:bg-slate-700'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${filtersOpen ? '' : 'hidden lg:grid'}`}>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground dark:text-[#94A3B8]">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                aria-label="Date from"
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-[#1F2937] dark:bg-[#0F172A] dark:text-[#E5E7EB]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground dark:text-[#94A3B8]">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                aria-label="Date to"
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-[#1F2937] dark:bg-[#0F172A] dark:text-[#E5E7EB]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground dark:text-[#94A3B8]">
                <Building2 className="h-3.5 w-3.5" aria-hidden /> Store context
              </span>
              <select
                value={selectedBranchId ?? ''}
                disabled={!branches.length}
                title={branches.length ? 'Switch workspace store context' : 'No branches loaded yet'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) onBranchChange(v);
                }}
                aria-label="Store or branch filter"
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#1F2937] dark:bg-[#0F172A] dark:text-[#E5E7EB]"
              >
                {!branches.length ? (
                  <option value="">Default</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground dark:text-[#94A3B8]">Account</span>
              <select
                value={accountId}
                onChange={(e) => onAccountIdChange(e.target.value)}
                aria-label="Filter by ledger account"
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-[#1F2937] dark:bg-[#0F172A] dark:text-[#E5E7EB]"
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {clientFilterNotice ? (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{clientFilterNotice}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 border-t border-[#E5E7EB] pt-4 sm:flex-row sm:items-center lg:flex-col lg:items-end lg:border-t-0 lg:pt-0 dark:border-[#1F2937]">
          <div className="flex items-center gap-2">
            <label htmlFor="ledger-sort" className="sr-only">
              Sort order
            </label>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-[#94A3B8]">Sort</span>
            <select
              id="ledger-sort"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as LedgerSortId)}
              aria-label="Sort ledger entries"
              className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-[#1F2937] dark:bg-[#0F172A] dark:text-[#E5E7EB]"
            >
              {SORT_OPTS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs font-semibold tabular-nums text-muted-foreground dark:text-[#94A3B8]" aria-live="polite">
            {entryCountLabel}
          </p>
        </div>
      </div>
    </div>
  );
};

export function ledgerLineTotals(entry: LedgerJournalEntry): { debit: number; credit: number } {
  const lines = entry.lines || [];
  const debit = lines.reduce((s, l) => s + Number(l?.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + Number(l?.credit || 0), 0);
  return { debit, credit };
}
