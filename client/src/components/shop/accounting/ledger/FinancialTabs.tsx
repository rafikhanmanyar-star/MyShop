import React from 'react';
import { motion } from 'framer-motion';

export interface FinancialTabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface FinancialTabsProps {
  tabs: FinancialTabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export const FinancialTabs: React.FC<FinancialTabsProps> = ({ tabs, activeId, onChange }) => {
  return (
    <div role="tablist" aria-label="Financial engine sections" className="flex gap-1 overflow-x-auto pb-0 sm:gap-8">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            id={`financial-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`relative shrink-0 py-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0F172A] ${
              active
                ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                : 'font-medium text-muted-foreground hover:text-foreground dark:text-[#94A3B8] dark:hover:text-[#E5E7EB]'
            }`}
          >
            <span className="flex items-center gap-2 whitespace-nowrap">
              {tab.icon}
              {tab.label}
            </span>
            {active && (
              <motion.span
                layoutId="financial-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-indigo-600 dark:bg-indigo-400"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
