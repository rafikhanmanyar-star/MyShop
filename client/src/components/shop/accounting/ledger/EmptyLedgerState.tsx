import React from 'react';
import { ClipboardList } from 'lucide-react';
import { motion } from 'framer-motion';

export const EmptyLedgerState: React.FC<{ onManualJournal?: () => void }> = ({ onManualJournal }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5E7EB] bg-white/70 px-6 py-16 text-center dark:border-[#1F2937] dark:bg-[#111827]/70"
      role="status"
      aria-live="polite"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
        <ClipboardList className="h-8 w-8" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-foreground dark:text-[#E5E7EB]">No journal entries match these filters</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground dark:text-[#94A3B8]">
        Try clearing search or widen the date range. POS and mobile activity will populate the ledger automatically.
      </p>
      {onManualJournal && (
        <button
          type="button"
          onClick={onManualJournal}
          className="mt-6 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          Manual journal entry
        </button>
      )}
    </motion.div>
  );
};
