import React, { useState, useEffect } from 'react';
import { expensesApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#84cc16', '#64748b'];

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--card-foreground)',
} as const;

const filterControlClass =
  'border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-background dark:bg-slate-900 text-foreground';

const ExpenseReports: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(now.toISOString().slice(0, 10));

  const [monthlySummary, setMonthlySummary] = useState<any>(null);
  const [categoryWise, setCategoryWise] = useState<any[]>([]);
  const [expenseVsRevenue, setExpenseVsRevenue] = useState<any>(null);
  const [vendorReport, setVendorReport] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      expensesApi.reports.monthlySummary(year, month),
      expensesApi.reports.categoryWise(fromDate, toDate),
      expensesApi.reports.expenseVsRevenue(fromDate, toDate),
      expensesApi.reports.vendor(fromDate, toDate),
    ])
      .then(([m, c, e, v]) => {
        setMonthlySummary(m);
        setCategoryWise(Array.isArray(c) ? c : []);
        setExpenseVsRevenue(e ?? null);
        setVendorReport(Array.isArray(v) ? v : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year, month, fromDate, toDate]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pieData = categoryWise.slice(0, 8).map((r) => ({ name: r.categoryName || 'Other', value: r.total }));
  const barData = categoryWise.slice(0, 10).map((r) => ({ name: (r.categoryName || 'Other').slice(0, 12), total: r.total }));

  return (
    <div className="space-y-8">
      <Card className="p-4 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">Monthly summary:</span>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className={filterControlClass}
          >
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className={filterControlClass}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">Report range:</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={filterControlClass} />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={filterControlClass} />
        </div>
      </Card>

      {/* Monthly summary */}
      {monthlySummary && (
        <Card className="p-6 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50">
          <h3 className="text-lg font-bold text-foreground dark:text-slate-200 mb-4">Monthly expense summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Total expenses</p>
              <p className="text-2xl font-bold text-foreground">{CURRENCY} {Number(monthlySummary.totalExpenses || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Previous month</p>
              <p className="text-xl font-semibold text-muted-foreground">{CURRENCY} {Number(monthlySummary.previousMonthTotal || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Growth %</p>
              <p className={`text-xl font-semibold ${(monthlySummary.growthPercent || 0) >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {(monthlySummary.growthPercent ?? 0).toFixed(1)}%
              </p>
            </div>
          </div>
          {monthlySummary.byCategory?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border dark:border-slate-700">
              <p className="text-sm font-medium text-muted-foreground mb-2">By category</p>
              <ul className="space-y-1 text-sm">
                {monthlySummary.byCategory.map((c: any) => (
                  <li key={c.categoryId} className="flex justify-between">
                    <span>{c.categoryName ?? '—'}</span>
                    <span className="font-medium">{CURRENCY} {Number(c.total).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Category-wise charts */}
      {categoryWise.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50 dark:[&_.recharts-pie-label-text]:fill-slate-300">
            <h3 className="text-lg font-bold text-foreground dark:text-slate-200 mb-4">Category breakdown (Pie)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [CURRENCY + ' ' + v.toLocaleString(), 'Amount']} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-6 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50 dark:[&_.recharts-cartesian-axis-tick_text]:fill-slate-400">
            <h3 className="text-lg font-bold text-foreground dark:text-slate-200 mb-4">Top categories (Bar)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <XAxis type="number" tickFormatter={(v) => CURRENCY + ' ' + (v / 1000).toFixed(0) + 'k'} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <Tooltip formatter={(v: number) => [CURRENCY + ' ' + v.toLocaleString(), 'Total']} contentStyle={tooltipStyle} />
                <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} name="Expense" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* Expense vs Revenue */}
      {expenseVsRevenue && (
        <Card className="p-6 border-none dark:border dark:border-slate-700/80 shadow-sm dark:bg-slate-900/50">
          <h3 className="text-lg font-bold text-foreground dark:text-slate-200 mb-4">Expense vs revenue</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Total sales</p>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{CURRENCY} {Number(expenseVsRevenue.totalSales || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Total expenses</p>
              <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{CURRENCY} {Number(expenseVsRevenue.totalExpenses || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Net profit</p>
              <p className={`text-xl font-bold ${(expenseVsRevenue.netProfit ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {CURRENCY} {Number(expenseVsRevenue.netProfit ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Expense % of revenue</p>
              <p className="text-xl font-bold text-foreground">{(expenseVsRevenue.expensePercentOfRevenue ?? 0).toFixed(1)}%</p>
            </div>
          </div>
        </Card>
      )}

      {/* Vendor report */}
      {vendorReport.length > 0 && (
        <Card className="p-6 border-none dark:border dark:border-slate-700/80 shadow-sm overflow-hidden dark:bg-slate-900/50">
          <h3 className="text-lg font-bold text-foreground dark:text-slate-200 mb-4">Vendor expense report</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/80 dark:bg-slate-800 border-b border-border dark:border-slate-700">
                  <th className="text-left p-3 font-semibold text-foreground">Vendor</th>
                  <th className="text-right p-3 font-semibold text-foreground">Total paid</th>
                  <th className="text-right p-3 font-semibold text-foreground">Expense count</th>
                </tr>
              </thead>
              <tbody>
                {vendorReport.filter((v) => v.totalPaid > 0).map((v) => (
                  <tr key={v.vendorId} className="border-b border-border dark:border-slate-700 hover:bg-muted/30 dark:hover:bg-slate-800/40">
                    <td className="p-3">{v.vendorName}</td>
                    <td className="p-3 text-right font-medium">{CURRENCY} {Number(v.totalPaid).toLocaleString()}</td>
                    <td className="p-3 text-right text-muted-foreground">{v.expenseCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!monthlySummary && !expenseVsRevenue && categoryWise.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No report data for the selected period.</div>
      )}
    </div>
  );
};

export default ExpenseReports;
