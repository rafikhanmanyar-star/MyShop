import React, { useState, useEffect, useCallback } from 'react';
import { accountingApi, expensesApi } from '../../../services/shopApi';
import { getAllPending, processQueue } from '../../../services/expenseSyncService';
import { CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import ExpenseFormModal from './ExpenseFormModal';
import { Search, Trash2, Download, CloudOff, Cloud, Plus } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const PAGE_SIZE = 25;

function formatPaymentMethod(pm: string | undefined) {
  if (!pm) return '—';
  const u = String(pm).toUpperCase();
  if (u === 'CASH') return 'Cash';
  if (u === 'BANK') return 'Bank';
  if (u === 'OTHER') return 'Other';
  return pm;
}

const ExpensesTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState<{ rows: any[]; total: number }>({ rows: [], total: 0 });
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterApply, setFilterApply] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    categoryId: '',
    accountId: '',
    paymentMethod: '',
    search: '',
  });
  const [categories, setCategories] = useState<any[]>([]);
  const [coaExpense, setCoaExpense] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const from = filters.fromDate || undefined;
    const to = filters.toDate || undefined;
    expensesApi
      .list({
        fromDate: from,
        toDate: to,
        categoryId: filters.categoryId || undefined,
        accountId: filters.accountId || undefined,
        paymentMethod: filters.paymentMethod || undefined,
        search: filters.search || undefined,
        page,
        limit: PAGE_SIZE,
      })
      .then((res) => setData(Array.isArray(res) ? { rows: res, total: res.length } : res))
      .catch(() => setData({ rows: [], total: 0 }))
      .finally(() => setLoading(false));
    getAllPending().then(setPendingItems).catch(() => setPendingItems([]));
  }, [filters, page, filterApply]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    Promise.all([expensesApi.getCategories(false), accountingApi.getAccounts()]).then(([c, acc]) => {
      setCategories(Array.isArray(c) ? c : []);
      const raw = Array.isArray(acc) ? acc : [];
      setCoaExpense(
        raw
          .filter((a: any) => a.type === 'Expense')
          .map((a: any) => ({ id: a.id, name: a.name, code: a.code }))
      );
    }).catch(() => {});
  }, []);

  const handleSyncNow = () => {
    setSyncing(true);
    processQueue()
      .then(() => load())
      .finally(() => setSyncing(false));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const serverRows = data.rows.filter((r) => !r._pending);
    if (selectedIds.size === serverRows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(serverRows.map((r) => r.id)));
  };

  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} expense(s)? This will reverse accounting entries.`)) return;
    setDeleting(true);
    Promise.all(Array.from(selectedIds).map((id) => expensesApi.delete(id)))
      .then(() => {
        setSelectedIds(new Set());
        load();
      })
      .finally(() => setDeleting(false));
  };

  const exportCsv = () => {
    const headers = ['Date', 'Category', 'Account', 'Amount', 'Payment method', 'Description', 'Reference'];
    const allRows = [
      ...pendingItems.map((p) => ({
        expenseDate: p.payload.expenseDate,
        categoryName: '',
        expenseAccountName: '',
        amount: p.payload.amount,
        paymentMethod: p.payload.paymentMethod,
        description: p.payload.description,
        referenceNumber: p.payload.referenceNumber,
      })),
      ...data.rows,
    ];
    const rows = allRows.map((r) => [
      r.expenseDate,
      (r as any).categoryName ?? '',
      (r as any).expenseAccountName ?? '',
      (r as any).amount,
      formatPaymentMethod((r as any).paymentMethod),
      ((r as any).description ?? '').replace(/"/g, '""'),
      (r as any).referenceNumber ?? '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button onClick={() => setShowAdd(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add expense
        </Button>
      </div>

      <ExpenseFormModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => {
          setPage(1);
          setFilterApply((x) => x + 1);
        }}
      />

      <Card className="p-4 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground"
          />
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground"
          />
          <select
            value={filters.categoryId}
            onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground min-w-[140px]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filters.accountId}
            onChange={(e) => setFilters((f) => ({ ...f, accountId: e.target.value }))}
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground min-w-[160px]"
          >
            <option value="">All accounts</option>
            {coaExpense.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code ? `${a.code} — ${a.name}` : a.name}
              </option>
            ))}
          </select>
          <select
            value={filters.paymentMethod}
            onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value }))}
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground"
          >
            <option value="">All methods</option>
            <option value="CASH">Cash</option>
            <option value="BANK">Bank</option>
            <option value="OTHER">Other</option>
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search description…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-background dark:bg-slate-900 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Button
            onClick={() => {
              setPage(1);
              setFilterApply((x) => x + 1);
            }}
            variant="secondary"
          >
            Apply
          </Button>
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-foreground hover:bg-muted/50 dark:hover:bg-slate-800 text-sm font-medium bg-background dark:bg-slate-900"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          {isAdmin && selectedIds.size > 0 && (
            <Button onClick={bulkDelete} disabled={deleting} className="bg-rose-600 hover:bg-rose-700">
              <Trash2 className="w-4 h-4 mr-1" /> Delete ({selectedIds.size})
            </Button>
          )}
        </div>
      </Card>

      {pendingItems.length > 0 && (
        <Card className="p-4 border-none shadow-sm bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-medium">
            <CloudOff className="w-5 h-5" />
            {pendingItems.length} expense(s) saved offline. They will sync when you are back online.
          </span>
          <Button variant="secondary" onClick={handleSyncNow} disabled={syncing} className="flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </Card>
      )}

      <Card className="border-none dark:border dark:border-slate-700/80 shadow-sm overflow-hidden dark:bg-slate-900/50">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/80 dark:bg-slate-800 border-b border-border dark:border-slate-700">
                  {isAdmin && (
                    <th className="text-left p-3">
                      <input
                        type="checkbox"
                        checked={
                          data.rows.length > 0 &&
                          selectedIds.size === data.rows.filter((r) => !(r as any)._pending).length
                        }
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  <th className="text-left p-3 font-semibold text-foreground">Date</th>
                  <th className="text-left p-3 font-semibold text-foreground">Category</th>
                  <th className="text-left p-3 font-semibold text-foreground">Account</th>
                  <th className="text-right p-3 font-semibold text-foreground">Amount</th>
                  <th className="text-left p-3 font-semibold text-foreground">Payment</th>
                  <th className="text-left p-3 font-semibold text-foreground">Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...pendingItems.map((p) => ({
                    id: p.localId,
                    _pending: true,
                    expenseDate: p.payload.expenseDate,
                    categoryName: '—',
                    expenseAccountName: '—',
                    amount: p.payload.amount,
                    paymentMethod: p.payload.paymentMethod,
                    description: p.payload.description ?? '—',
                  })),
                  ...data.rows,
                ].map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border dark:border-slate-700 hover:bg-muted/50 dark:hover:bg-slate-800/50 ${(row as any)._pending ? 'bg-amber-50/50 dark:bg-amber-950/25' : ''}`}
                  >
                    {isAdmin && (
                      <td className="p-3">
                        {(row as any)._pending ? (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                          />
                        )}
                      </td>
                    )}
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{row.expenseDate}</td>
                    <td className="p-3">{(row as any).categoryName ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">
                      {(row as any).expenseAccountCode
                        ? `${(row as any).expenseAccountCode} — ${(row as any).expenseAccountName || ''}`
                        : ((row as any).expenseAccountName ?? '—')}
                    </td>
                    <td className="p-3 text-right font-medium whitespace-nowrap">
                      {CURRENCY} {Number(row.amount).toLocaleString()}
                    </td>
                    <td className="p-3">{formatPaymentMethod((row as any).paymentMethod)}</td>
                    <td className="p-3 max-w-[280px] truncate" title={(row as any).description ?? ''}>
                      {(row as any).description ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.length === 0 && pendingItems.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">No expenses match the filters.</div>
            )}
          </div>
        )}
        <div className="px-4 py-3 border-t border-border dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Total: {data.total} expense(s)
            {pendingItems.length > 0 && ` · ${pendingItems.length} pending sync`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ExpensesTab;
