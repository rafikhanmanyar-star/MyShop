import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Repeat, List, BarChart3 } from 'lucide-react';
import AddExpenseForm from './AddExpenseForm';
import ExpenseList from './ExpenseList';
import RecurringExpenses from './RecurringExpenses';
import ExpenseReports from './ExpenseReports';
import { processQueue, subscribeToOnline, isOnline } from '../../../services/expenseSyncService';

type TabId = 'add' | 'recurring' | 'list' | 'reports';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'add', label: 'Add Expense', icon: Plus },
  { id: 'recurring', label: 'Recurring Expenses', icon: Repeat },
  { id: 'list', label: 'Expense List', icon: List },
  { id: 'reports', label: 'Expense Reports', icon: BarChart3 },
];

const ExpensePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('add');
  const [refreshListKey, setRefreshListKey] = useState(0);

  const onExpenseSaved = useCallback(() => {
    setRefreshListKey((k) => k + 1);
  }, []);

  // Offline-first: process pending queue when coming online and once on mount if online
  useEffect(() => {
    const runSync = () => {
      processQueue().then((r) => {
        if (r.succeeded > 0) onExpenseSaved();
      });
    };
    if (isOnline()) runSync();
    const unsubscribe = subscribeToOnline(runSync);
    return unsubscribe;
  }, [onExpenseSaved]);

  return (
    <div className="flex flex-col h-full bg-muted/80 dark:bg-slate-800 -m-4 md:-m-8">
      <div className="bg-card dark:bg-slate-900 border-b border-border dark:border-slate-700 px-8 pt-6 shadow-sm z-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground dark:text-slate-200 tracking-tight">Expense Management</h1>
          <p className="text-muted-foreground dark:text-slate-400 text-sm font-medium">Record, manage, and analyze shop expenses with full accounting integration.</p>
        </div>
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${
                activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground hover:text-muted-foreground dark:hover:text-slate-300'
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
        {activeTab === 'add' && <AddExpenseForm onSaved={onExpenseSaved} />}
        {activeTab === 'recurring' && <RecurringExpenses onGenerated={onExpenseSaved} />}
        {activeTab === 'list' && <ExpenseList key={refreshListKey} />}
        {activeTab === 'reports' && <ExpenseReports />}
      </div>
    </div>
  );
};

export default ExpensePage;
