import React, { useState, useEffect } from 'react';
import { expensesApi, shopApi } from '../../../services/shopApi';
import { getAllPending, processQueue } from '../../../services/expenseSyncService';
import { CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { Search, Trash2, Download, CloudOff, Cloud } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const ExpenseList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState<{ rows: any[]; total: number }>({ rows: [], total: 0 });
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    categoryId: '',
    vendorId: '',
    paymentMethod: '',
    search: '',
  });
  const [categories, setCategories] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    const from = filters.fromDate || undefined;
    const to = filters.toDate || undefined;
    expensesApi
      .list({
        fromDate: from,
        toDate: to,
        categoryId: filters.categoryId || undefined,
        vendorId: filters.vendorId || undefined,
        paymentMethod: filters.paymentMethod || undefined,
        search: filters.search || undefined,
        limit: 500,
      })
      .then((res) => setData(Array.isArray(res) ? { rows: res, total: res.length } : res))
      .catch(() => setData({ rows: [], total: 0 }))
      .finally(() => setLoading(false));
    getAllPending().then(setPendingItems).catch(() => setPendingItems([]));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSyncNow = () => {
    setSyncing(true);
    processQueue()
      .then(() => {
        load();
      })
      .finally(() => setSyncing(false));
  };

  useEffect(() => {
    Promise.all([expensesApi.getCategories(), shopApi.getVendors()]).then(([c, v]) => {
      setCategories(Array.isArray(c) ? c : []);
      setVendors(Array.isArray(v) ? v : []);
    }).catch(() => {});
  }, []);

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
    const headers = ['Date', 'Category', 'Payee', 'Amount', 'Payment', 'Status', 'Reference', 'Description'];
    const allRows = [
      ...pendingItems.map((p) => ({
        expenseDate: p.payload.expenseDate,
        categoryName: '',
        payeeName: p.payload.payeeName,
        vendorName: '',
        amount: p.payload.amount,
        paymentMethod: p.payload.paymentMethod,
        status: 'pending',
        referenceNumber: p.payload.referenceNumber,
        description: p.payload.description,
      })),
      ...data.rows,
    ];
    const rows = allRows.map((r) => [
      r.expenseDate,
      (r as any).categoryName ?? '',
      ((r as any).payeeName || (r as any).vendorName) ?? '',
      (r as any).amount,
      (r as any).paymentMethod,
      (r as any).status,
      (r as any).referenceNumber ?? '',
      ((r as any).description ?? '').replace(/"/g, '""'),
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

  return (
    <div className="space-y-6">
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
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filters.vendorId}
            onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground"
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <select
            value={filters.paymentMethod}
            onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value }))}
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground"
          >
            <option value="">All methods</option>
            <option value="Cash">Cash</option>
            <option value="Bank">Bank</option>
            <option value="Credit">Credit</option>
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search description..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-background dark:bg-slate-900 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Button onClick={load} variant="secondary">Apply</Button>
          <button
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
            {pendingItems.length} expense(s) saved offline. They will sync when you’re back online.
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
                  <th className="text-left p-3 font-semibold text-foreground">Payee / Vendor</th>
                  <th className="text-right p-3 font-semibold text-foreground">Amount</th>
                  <th className="text-left p-3 font-semibold text-foreground">Payment</th>
                  <th className="text-left p-3 font-semibold text-foreground">Status</th>
                  <th className="text-left p-3 font-semibold text-foreground">Reference</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...pendingItems.map((p) => ({
                    id: p.localId,
                    _pending: true,
                    expenseDate: p.payload.expenseDate,
                    categoryName: '—',
                    payeeName: p.payload.payeeName,
                    vendorName: '',
                    amount: p.payload.amount,
                    paymentMethod: p.payload.paymentMethod,
                    status: 'Pending sync',
                    referenceNumber: p.payload.referenceNumber ?? '—',
                  })),
                  ...data.rows,
                ].map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border dark:border-slate-700 hover:bg-muted/50/50 dark:hover:bg-slate-800/50 ${(row as any)._pending ? 'bg-amber-50/50 dark:bg-amber-950/25' : ''}`}
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
                    <td className="p-3 text-muted-foreground">{row.expenseDate}</td>
                    <td className="p-3">{(row as any).categoryName ?? '—'}</td>
                    <td className="p-3">{(row.payeeName || (row as any).vendorName) ?? '—'}</td>
                    <td className="p-3 text-right font-medium">{CURRENCY} {Number(row.amount).toLocaleString()}</td>
                    <td className="p-3">{row.paymentMethod}</td>
                    <td className="p-3">
                      <span
                        className={
                          (row as any)._pending
                            ? 'text-amber-600 dark:text-amber-400 font-medium'
                            : row.status === 'paid'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{(row as any).referenceNumber ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.length === 0 && pendingItems.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">No expenses match the filters.</div>
            )}
          </div>
        )}
        <div className="px-4 py-2 border-t border-border dark:border-slate-700 text-sm text-muted-foreground">
          Total: {data.total} expense(s)
          {pendingItems.length > 0 && ` · ${pendingItems.length} pending sync`}
        </div>
      </Card>
    </div>
  );
};

export default ExpenseList;
