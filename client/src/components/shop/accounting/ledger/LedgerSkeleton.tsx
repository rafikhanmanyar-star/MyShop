import React from 'react';
import { motion } from 'framer-motion';

const rows = Array.from({ length: 6 });

export const LedgerSkeleton: React.FC = () => (
  <div className="space-y-4" aria-hidden>
    {rows.map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0.55 }}
        animate={{ opacity: [0.5, 0.95, 0.5] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.06 }}
        className="flex flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-5 dark:border-[#1F2937] dark:bg-[#111827] sm:flex-row sm:items-center"
      >
        <div className="h-16 flex-1 space-y-2">
          <div className="h-4 w-2/5 rounded-lg bg-muted dark:bg-slate-700/80" />
          <div className="h-3 w-full max-w-xs rounded-lg bg-muted/80 dark:bg-slate-800" />
          <div className="h-3 w-3/5 rounded-lg bg-muted/60 dark:bg-slate-800/90" />
        </div>
        <div className="flex shrink-0 gap-6">
          <div className="h-8 w-20 rounded-lg bg-muted dark:bg-slate-700/80" />
          <div className="h-8 w-20 rounded-lg bg-muted dark:bg-slate-700/80" />
        </div>
      </motion.div>
    ))}
  </div>
);
