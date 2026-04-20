import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { accountingApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import DailyReportSummaryPanel from './DailyReportSummaryPanel';

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );
}

function formatQty(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(Number.isFinite(n) ? n : 0);
}

const ReportShell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex w-full min-w-0 flex-col h-full bg-muted/50 dark:bg-slate-800">
    <div className="bg-card dark:bg-slate-900 border-b border-border dark:border-slate-700 px-8 pt-6 shadow-sm z-10">
      <h1 className="text-2xl font-semibold text-foreground dark:text-slate-200 tracking-tight">{title}</h1>
      <p className="text-muted-foreground dark:text-slate-400 text-sm font-medium mt-1">
        Single source of truth — POS, mobile, inventory, expenses, khata.
      </p>
    </div>
    <div className="flex-1 overflow-y-auto p-8">{children}</div>
  </div>
);

const DailyReportDashboard: React.FC = () => (
  <ReportShell title="Daily Report">
    <DailyReportSummaryPanel urlSync />
  </ReportShell>
);

const InventoryOutDrill: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const branchId =
    searchParams.get('branchId') === '' || searchParams.get('branchId') === 'all'
      ? null
      : searchParams.get('branchId');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: r } = await accountingApi.dailyReportInventoryOut(date, branchId);
      setRows(r || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ReportShell title="Inventory out — detail">
      <div className="w-full min-w-0 space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/accounting/reports/daily?${searchParams.toString()}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to daily report
        </button>
        <p className="text-sm text-muted-foreground">
          Date <span className="font-mono font-semibold">{date}</span>
          {branchId ? (
            <>
              {' '}
              · Branch <span className="font-mono text-xs">{branchId}</span>
            </>
          ) : null}
        </p>
        <div className="rounded-xl border border-border dark:border-slate-700 overflow-hidden bg-card dark:bg-slate-900/50">
          <table className="w-full text-sm">
            <thead className="bg-muted dark:bg-slate-800 text-xs uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Item</th>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-right px-4 py-3">Qty out</th>
                <th className="text-left px-4 py-3">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No stock movements out for this day.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.item_id} className="hover:bg-muted/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-medium text-foreground">{r.item_name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.sku}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatQty(Number(r.total_qty_out))}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.unit}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
};

const InventoryInDrill: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const branchId =
    searchParams.get('branchId') === '' || searchParams.get('branchId') === 'all'
      ? null
      : searchParams.get('branchId');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: r } = await accountingApi.dailyReportInventoryIn(date, branchId);
      setRows(r || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ReportShell title="Inventory in (procurement) — detail">
      <div className="w-full min-w-0 space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/accounting/reports/daily?${searchParams.toString()}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to daily report
        </button>
        <div className="rounded-xl border border-border dark:border-slate-700 overflow-hidden bg-card dark:bg-slate-900/50">
          <table className="w-full text-sm">
            <thead className="bg-muted dark:bg-slate-800 text-xs uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Item</th>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-right px-4 py-3">Qty in</th>
                <th className="text-left px-4 py-3">Unit</th>
                <th className="text-left px-4 py-3">Supplier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No purchase receipts for this day.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.item_id} className="hover:bg-muted/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-medium text-foreground">{r.item_name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.sku}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatQty(Number(r.total_qty_in))}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.unit}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.supplier || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
};

const ExpensesDrill: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const branchId =
    searchParams.get('branchId') === '' || searchParams.get('branchId') === 'all'
      ? null
      : searchParams.get('branchId');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: r } = await accountingApi.dailyReportExpenses(date, branchId);
      setRows(r || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ReportShell title="Expenses — detail">
      <div className="w-full min-w-0 space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/accounting/reports/daily?${searchParams.toString()}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to daily report
        </button>
        <div className="rounded-xl border border-border dark:border-slate-700 overflow-hidden bg-card dark:bg-slate-900/50">
          <table className="w-full text-sm">
            <thead className="bg-muted dark:bg-slate-800 text-xs uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Notes</th>
                <th className="text-left px-4 py-3">Paid from</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No expenses for this day.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-mono text-xs">{r.date}</td>
                    <td className="px-4 py-2">{r.expense_category}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {CURRENCY} {formatMoney(Number(r.amount))}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground max-w-xs truncate" title={r.notes}>
                      {r.notes || '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.paid_from_account || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
};

const ProductsCreatedDrill: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: r } = await accountingApi.dailyReportProductsCreated(date);
      setRows(r || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ReportShell title="New products — detail">
      <div className="w-full min-w-0 space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/accounting/reports/daily?${searchParams.toString()}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to daily report
        </button>
        <div className="rounded-xl border border-border dark:border-slate-700 overflow-hidden bg-card dark:bg-slate-900/50">
          <table className="w-full text-sm">
            <thead className="bg-muted dark:bg-slate-800 text-xs uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Created by</th>
                <th className="text-left px-4 py-3">Created at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No new SKUs for this day.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.sku}-${i}`} className="hover:bg-muted/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                    <td className="px-4 py-2 font-medium">{r.product_name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.category || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.created_by || '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.created_at}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
};

const KhataDrill: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: r } = await accountingApi.dailyReportKhata(date);
      setRows(r || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ReportShell title="Khata ledger — detail">
      <div className="w-full min-w-0 space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/accounting/reports/daily?${searchParams.toString()}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to daily report
        </button>
        <p className="text-sm text-muted-foreground">
          All branches · date <span className="font-mono font-semibold text-foreground">{date}</span>
        </p>
        <div className="rounded-xl border border-border dark:border-slate-700 overflow-hidden bg-card dark:bg-slate-900/50">
          <table className="w-full text-sm">
            <thead className="bg-muted dark:bg-slate-800 text-xs uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Note</th>
                <th className="text-left px-4 py-3">Sale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No khata entries for this day.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.created_at}</td>
                    <td className="px-4 py-2 font-medium">{r.customer_name || '—'}</td>
                    <td className="px-4 py-2 capitalize">{r.type}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {CURRENCY} {formatMoney(Number(r.amount))}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground max-w-xs truncate" title={r.note}>
                      {r.note || '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.sale_number || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
};

const DailyReportPage: React.FC = () => {
  return (
    <Routes>
      <Route index element={<DailyReportDashboard />} />
      <Route path="inventory-out" element={<InventoryOutDrill />} />
      <Route path="inventory-in" element={<InventoryInDrill />} />
      <Route path="expenses" element={<ExpensesDrill />} />
      <Route path="products-created" element={<ProductsCreatedDrill />} />
      <Route path="khata" element={<KhataDrill />} />
      <Route path="*" element={<Navigate to="/accounting/reports/daily" replace />} />
    </Routes>
  );
};

export default DailyReportPage;
