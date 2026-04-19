import React, { useState, useEffect, useCallback } from 'react';
import { accountingApi, expensesApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#84cc16', '#64748b'];

const filterClass =
  'border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground';

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--card-foreground)',
} as const;

const DETAIL_LIMIT = 20;

const ExpenseReportsTab: React.FC = () => {
  const now = new Date();
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(now.toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [coaExpense, setCoaExpense] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [summary, setSummary] = useState<{ total: number } | null>(null);
  const [categoryWise, setCategoryWise] = useState<any[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; total: number }[]>([]);
  const [detailRows, setDetailRows] = useState<any[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailPage, setDetailPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReports = useCallback(async () => {
    const reportFilters = { categoryId: categoryId || undefined, accountId: accountId || undefined };
    setLoading(true);
    setError('');
    try {
      const [s, cw, mt, list] = await Promise.all([
        expensesApi.reports.summary(fromDate, toDate, reportFilters),
        expensesApi.reports.categoryWise(fromDate, toDate, accountId || undefined),
        expensesApi.reports.monthlyTrend(fromDate, toDate, reportFilters),
        expensesApi.list({
          fromDate,
          toDate,
          categoryId: categoryId || undefined,
          accountId: accountId || undefined,
          page: detailPage,
          limit: DETAIL_LIMIT,
        }),
      ]);
      setSummary(s && typeof s === 'object' && 'total' in s ? (s as { total: number }) : { total: 0 });
      setCategoryWise(Array.isArray(cw) ? cw : []);
      setMonthlyTrend(Array.isArray(mt) ? mt : []);
      const lr = Array.isArray(list) ? { rows: list, total: list.length } : list;
      setDetailRows(lr.rows || []);
      setDetailTotal(lr.total ?? 0);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, categoryId, accountId, detailPage]);

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

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const pieData = categoryWise.slice(0, 10).map((r) => ({
    name: r.categoryName || 'Other',
    value: r.total,
  }));

  if (loading && summary == null && !error) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(detailTotal / DETAIL_LIMIT));

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 text-sm border border-rose-200/80 dark:border-rose-800/60">
          {error}
        </div>
      )}

      <Card className="p-4 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Range</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setDetailPage(1);
            }}
            className={filterClass}
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setDetailPage(1);
            }}
            className={filterClass}
          />
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setDetailPage(1);
            }}
            className={`${filterClass} min-w-[140px]`}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setDetailPage(1);
            }}
            className={`${filterClass} min-w-[160px]`}
          >
            <option value="">All accounts</option>
            {coaExpense.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code ? `${a.code} — ${a.name}` : a.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total expense</p>
          <p className="text-2xl font-bold text-foreground mt-1">
            {CURRENCY} {Number(summary?.total ?? 0).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-2">Selected date range and filters</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50">
          <h3 className="text-lg font-bold text-foreground mb-4">Category breakdown</h3>
          {pieData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No data in this range.</p>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${CURRENCY} ${v.toLocaleString()}`, '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-6 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50">
          <h3 className="text-lg font-bold text-foreground mb-4">Monthly trend</h3>
          {monthlyTrend.length === 0 ? (
            <p className="text-muted-foreground text-sm">No data in this range.</p>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [`${CURRENCY} ${Number(v).toLocaleString()}`, 'Total']}
                  />
                  <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50">
        <h3 className="text-lg font-bold text-foreground mb-4">Detailed report</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border dark:border-slate-700">
                <th className="text-left p-2 font-semibold">Date</th>
                <th className="text-left p-2 font-semibold">Category</th>
                <th className="text-left p-2 font-semibold">Account</th>
                <th className="text-right p-2 font-semibold">Amount</th>
                <th className="text-left p-2 font-semibold">Payment</th>
                <th className="text-left p-2 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 dark:border-slate-800">
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{row.expenseDate}</td>
                  <td className="p-2">{row.categoryName ?? '—'}</td>
                  <td className="p-2 text-muted-foreground text-xs">
                    {row.expenseAccountCode
                      ? `${row.expenseAccountCode} — ${row.expenseAccountName || ''}`
                      : row.expenseAccountName ?? '—'}
                  </td>
                  <td className="p-2 text-right font-medium">
                    {CURRENCY} {Number(row.amount).toLocaleString()}
                  </td>
                  <td className="p-2">{row.paymentMethod}</td>
                  <td className="p-2 max-w-xs truncate">{row.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {detailRows.length === 0 && !loading && (
            <p className="text-muted-foreground text-sm py-8 text-center">No rows in this range.</p>
          )}
        </div>
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            {detailTotal} row(s) total · page {detailPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={detailPage <= 1 || loading}
              onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={detailPage >= totalPages || loading}
              onClick={() => setDetailPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ExpenseReportsTab;
