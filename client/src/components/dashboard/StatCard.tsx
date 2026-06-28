import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type StatCardProps = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Tailwind background class for the left accent bar, e.g. "bg-sky-500". */
  accentClass?: string;
  icon?: LucideIcon;
  iconClass?: string;
  /** Dark, emphasized card used for the headline metric (e.g. Net sales). */
  highlight?: boolean;
  /** Percentage change rendered as a coloured delta chip. */
  delta?: number;
  loading?: boolean;
  onClick?: () => void;
};

export default function StatCard({
  label,
  value,
  sub,
  accentClass = 'bg-[#4A90E2]',
  icon: Icon,
  iconClass = 'text-[#4A90E2]',
  highlight = false,
  delta,
  loading = false,
  onClick,
}: StatCardProps) {
  const base = highlight
    ? 'border-transparent bg-[#212529] text-white dark:bg-slate-800'
    : 'border-gray-100 bg-white text-[#212529] dark:border-gray-700 dark:bg-card dark:text-foreground';
  const interactive = onClick
    ? 'cursor-pointer transition hover:shadow-md hover:-translate-y-0.5'
    : '';

  const labelColor = highlight
    ? 'text-white/70'
    : 'text-[#6C757D] dark:text-muted-foreground';

  const subColor = highlight ? 'text-white/65' : 'text-[#6C757D] dark:text-muted-foreground';

  const content = (
    <>
      <span
        className={`absolute inset-y-2 left-0 w-1 rounded-full ${highlight ? 'bg-white/70' : accentClass}`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2 pl-2.5">
        <div className="min-w-0">
          <p className={`text-[0.62rem] font-bold uppercase tracking-wider ${labelColor}`}>{label}</p>
          <p className="mt-1 truncate text-xl font-bold tabular-nums tracking-tight">
            {loading ? '—' : value}
          </p>
          {typeof delta === 'number' && Number.isFinite(delta) && !loading && (
            <p
              className={`mt-0.5 flex items-center gap-0.5 text-[0.65rem] font-semibold ${
                delta >= 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}
            >
              {delta >= 0 ? (
                <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                <TrendingDown className="h-3 w-3" strokeWidth={2.5} />
              )}
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(1)}%
            </p>
          )}
          {sub && !loading ? <p className={`mt-0.5 text-[0.65rem] leading-snug ${subColor}`}>{sub}</p> : null}
        </div>
        {Icon ? (
          <Icon
            className={`h-4 w-4 shrink-0 opacity-90 ${highlight ? 'text-white/80' : iconClass}`}
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </div>
    </>
  );

  const cls = `relative overflow-hidden rounded-[10px] border p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none ${base} ${interactive}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} text-left`}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}
