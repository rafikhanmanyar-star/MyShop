import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, BarChart3, Settings, Receipt } from 'lucide-react';
import ExpensesTab from './ExpensesTab';
import ExpenseReportsTab from './ExpenseReportsTab';
import ExpenseSettingsTab from './ExpenseSettingsTab';
import { processQueue, subscribeToOnline, isOnline } from '../../../services/expenseSyncService';

type TabId = 'expenses' | 'reports' | 'settings';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const ExpensePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('expenses');
  const [listKey, setListKey] = useState(0);

  const bumpList = useCallback(() => {
    setListKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const runSync = () => {
      processQueue().then((r) => {
        if (r.succeeded > 0) bumpList();
      });
    };
    if (isOnline()) runSync();
    const unsubscribe = subscribeToOnline(runSync);
    return unsubscribe;
  }, [bumpList]);

  return (
    <div className="flex w-full min-w-0 flex-col h-full bg-muted/80 dark:bg-slate-800">
      <div className="bg-card dark:bg-slate-900 border-b border-border dark:border-slate-700 px-8 pt-6 shadow-sm z-10">
        <div className="mb-6 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
            <Wallet className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground dark:text-slate-200 tracking-tight">Expenses</h1>
            <p className="text-muted-foreground dark:text-slate-400 text-sm font-medium mt-0.5">
              Record shop spending, tie each line to the chart of accounts, and review trends by category and month.
            </p>
          </div>
        </div>
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-muted-foreground hover:text-muted-foreground dark:hover:text-slate-300'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'expenses' && <ExpensesTab refreshKey={listKey} />}
        {activeTab === 'reports' && <ExpenseReportsTab />}
        {activeTab === 'settings' && <ExpenseSettingsTab />}
      </div>
    </div>
  );
};

export default ExpensePage;
