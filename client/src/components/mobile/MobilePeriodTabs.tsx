import React from 'react';

export type MobilePeriod = 'today' | 'weekly' | 'monthly';

const TABS: { id: MobilePeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

export function isMobilePeriod(value: string | null): value is MobilePeriod {
  return value === 'today' || value === 'weekly' || value === 'monthly';
}

type Props = {
  active: MobilePeriod;
  onChange: (period: MobilePeriod) => void;
};

export default function MobilePeriodTabs({ active, onChange }: Props) {
  return (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-min gap-1.5 rounded-xl bg-gray-100/90 p-1 dark:bg-slate-800/80">
        {TABS.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`min-w-[4.25rem] shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition active:scale-95 ${
                selected
                  ? 'bg-white text-[#4A90E2] shadow-sm dark:bg-slate-900 dark:text-[#9bc5f0]'
                  : 'text-[#6C757D] hover:text-[#212529] dark:text-muted-foreground dark:hover:text-foreground'
              }`}
              aria-pressed={selected}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
