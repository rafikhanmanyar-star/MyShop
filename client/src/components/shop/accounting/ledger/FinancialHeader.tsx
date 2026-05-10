import React from 'react';
import { Download, FilePlus2 } from 'lucide-react';

interface FinancialHeaderProps {
  exportDisabled?: boolean;
  exportLabel?: string;
  onExportCsv?: () => void;
  onManualJournal: () => void;
}

export const FinancialHeader: React.FC<FinancialHeaderProps> = ({
  exportDisabled,
  exportLabel = 'Export CSV',
  onExportCsv,
  onManualJournal,
}) => {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-foreground dark:text-[#E5E7EB]">Financial Engine</h1>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground dark:text-[#94A3B8]">
          POS source-of-truth automated accounting
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {onExportCsv && (
          <button
            type="button"
            disabled={!!exportDisabled}
            onClick={onExportCsv}
            aria-disabled={!!exportDisabled}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all hover:border-indigo-200 hover:bg-muted/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-40 dark:border-[#1F2937] dark:bg-[#111827] dark:text-[#E5E7EB] dark:hover:border-indigo-500/40 dark:hover:bg-slate-800/80"
          >
            <Download className="h-4 w-4" aria-hidden />
            {exportLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onManualJournal}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(79,70,229,0.55)] transition-all hover:bg-indigo-700 hover:shadow-[0_8px_20px_-6px_rgba(79,70,229,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:ring-offset-[#0F172A]"
        >
          <FilePlus2 className="h-4 w-4" aria-hidden />
          Manual Journal
        </button>
      </div>
    </div>
  );
};
