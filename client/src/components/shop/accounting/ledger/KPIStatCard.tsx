import React from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface KPIStatCardProps {
  label: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'flat';
  loading?: boolean;
}

export const KPIStatCard: React.FC<KPIStatCardProps> = ({ label, value, helper, icon: Icon, trend, loading }) => {
  const TrendIcon = trend === 'down' ? ArrowDownRight : trend === 'up' ? ArrowUpRight : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend === 'down'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-muted-foreground';

  return (
    <motion.div
      whileHover={{ y: -3, transition: { type: 'spring', stiffness: 400, damping: 28 } }}
      className="group relative rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)] transition-shadow hover:shadow-[0_12px_28px_-8px_rgba(15,23,42,0.12)] dark:border-[#1F2937] dark:bg-[#111827]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground dark:text-[#94A3B8]">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-[60%] max-w-[12rem] animate-pulse rounded-lg bg-muted dark:bg-slate-700/80" />
          ) : (
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground dark:text-[#E5E7EB]">{value}</p>
          )}
          {helper ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              {!loading && trend && (
                <span className={`inline-flex items-center gap-0.5 font-semibold ${trendColor}`}>
                  <TrendIcon className="h-3.5 w-3.5" aria-hidden />
                </span>
              )}
              <span className="text-muted-foreground dark:text-[#94A3B8]">{helper}</span>
            </div>
          ) : null}
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-inner transition-transform group-hover:scale-105 dark:bg-indigo-950/60 dark:text-indigo-400"
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
};
