import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { accountingApi } from '../../../services/shopApi';
import { useBranch } from '../../../context/BranchContext';
import { CURRENCY } from '../../../constants';
import { getApiBaseUrl } from '../../../config/apiUrl';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Select from '../../ui/Select';

function useDailyReportStream(onUpdate: () => void) {
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const url = `${getApiBaseUrl()}/shop/accounting/reports/daily/stream`;
    const controller = new AbortController();

    const connect = () => {
      fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok || !response.body) return;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          const process = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const payload = JSON.parse(line.slice(6));
                      if (payload.type === 'daily_report_updated' || payload.type === 'sales_return_created') {
                        onUpdate();
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                }
              }
            } catch {
              setTimeout(connect, 5000);
            }
          };
          process();
        })
        .catch(() => {
          setTimeout(connect, 5000);
        });
    };

    connect();
    return () => controller.abort();
  }, [onUpdate]);
}

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

const DailyReportDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { branches } = useBranch();

  const date =
    searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const branchParam = searchParams.get('branchId');
  const branchId =
    branchParam === '' || branchParam === 'all' || branchParam == null ? null : branchParam;

  const [summary, setSummary] = useState<Awaited<ReturnType<typeof accountingApi.dailyReportSummary>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const bp = searchParams.get('branchId');
      const br = bp === '' || bp === 'all' || bp == null ? null : bp;
      const data = await accountingApi.dailyReportSummary(d, br);
      setSummary(data);
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to load report');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useDailyReportStream(load);

  useEffect(() => {
    load();
  }, [load]);

  const setDate = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('date', v);
    setSearchParams(next);
  };

  const setBranchFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (!v || v === 'all') next.delete('branchId');
    else next.set('branchId', v);
    setSearchParams(next);
  };

  const q = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('date', date);
    if (branchId) qs.set('branchId', branchId);
    return qs.toString();
  }, [date, branchId]);

  const cardClass =
    'rounded-2xl border border-border dark:border-slate-700 bg-card dark:bg-slate-900/60 p-5 shadow-sm transition hover:border-indigo-500/40 dark:hover:border-indigo-400/40 hover:shadow-md cursor-pointer text-left';

  return (
    <ReportShell title="Daily Report">
      <div className="w-full min-w-0 space-y-6">
        <div
          className="flex flex-wrap items-end gap-4
            [&_input]:!h-10 [&_input]:!min-h-0 [&_input]:!py-2 [&_input]:!text-sm
            [&_select]:!h-10 [&_select]:!min-h-0 [&_select]:!py-2 [&_select]:!text-sm
            [&_button]:!h-10 [&_button]:!min-h-0 [&_button]:!py-2 [&_button]:shrink-0"
        >
          <div className="w-44 shrink-0">
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="w-56 shrink-0">
            <Select label="Branch" value={branchId || 'all'} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="all">All locations</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="shrink-0 flex flex-col">
            <span className="block text-sm font-medium text-foreground mb-1.5 invisible select-none" aria-hidden="true">
              Action
            </span>
            <Button variant="secondary" onClick={() => load()} disabled={loading} className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <button type="button" className={cardClass} onClick={() => {}} aria-label="POS sales">
            <div className="text-2xl mb-1">🧾</div>
            <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">POS sales (gross)</div>
            <div className="text-2xl font-semibold text-foreground mt-1">
              {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.posSales ?? 0)}`}
            </div>
            <div className="text-xs text-muted-foreground mt-2">shop_sales (branch POS)</div>
          </button>

          <button type="button" className={cardClass} onClick={() => {}} aria-label="POS returns">
            <div className="text-2xl mb-1">↩️</div>
            <div className="text-xs font-bold uppercase text-rose-600 dark:text-rose-400 tracking-wider">POS returns</div>
            <div className="text-2xl font-semibold text-foreground mt-1">
              {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.posReturns ?? 0)}`}
            </div>
            <div className="text-xs text-muted-foreground mt-2">shop_sales_returns</div>
          </button>

          <button type="button" className={cardClass} onClick={() => {}} aria-label="Net POS sales">
            <div className="text-2xl mb-1">📊</div>
            <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Net POS sales</div>
            <div className="text-2xl font-semibold text-foreground mt-1">
              {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.netPosSales ?? 0)}`}
            </div>
            <div className="text-xs text-muted-foreground mt-2">Gross POS − returns</div>
          </button>

          <button type="button" className={cardClass} onClick={() => {}} aria-label="Mobile sales">
            <div className="text-2xl mb-1">📱</div>
            <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Mobile sales</div>
            <div className="text-2xl font-semibold text-foreground mt-1">
              {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.mobileSales ?? 0)}`}
            </div>
            <div className="text-xs text-muted-foreground mt-2">mobile_orders (non-cancelled)</div>
          </button>

          <button
            type="button"
            className={cardClass}
            onClick={() => navigate(`/accounting/reports/daily/inventory-out?${q}`)}
            aria-label="Inventory out"
          >
            <div className="text-2xl mb-1">📦</div>
            <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Inventory out</div>
            <div className="text-2xl font-semibold text-foreground mt-1">
              {loading ? '—' : formatQty(summary?.inventoryOutQty ?? 0)}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 font-semibold">Click for detail →</div>
          </button>

          <button
            type="button"
            className={cardClass}
            onClick={() => navigate(`/accounting/reports/daily/inventory-in?${q}`)}
            aria-label="Inventory in"
          >
            <div className="text-2xl mb-1">📥</div>
            <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Inventory in (procurement)</div>
            <div className="text-2xl font-semibold text-foreground mt-1">
              {loading ? '—' : formatQty(summary?.inventoryInQty ?? 0)}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 font-semibold">Click for detail →</div>
          </button>

          <button
            type="button"
            className={cardClass}
            onClick={() => navigate(`/accounting/reports/daily/expenses?${q}`)}
            aria-label="Expenses"
          >
            <div className="text-2xl mb-1">💸</div>
            <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Total expenses</div>
            <div className="text-2xl font-semibold text-foreground mt-1">
              {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.totalExpenses ?? 0)}`}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 font-semibold">Click for detail →</div>
          </button>

          <button
            type="button"
            className={cardClass}
            onClick={() => navigate(`/accounting/reports/daily/products-created?${q}`)}
            aria-label="New products"
          >
            <div className="text-2xl mb-1">🏷️</div>
            <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">New products</div>
            <div className="text-2xl font-semibold text-foreground mt-1">
              {loading ? '—' : summary?.newProductsCount ?? 0}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 font-semibold">Click for detail →</div>
          </button>

          <button
            type="button"
            className={cardClass}
            onClick={() => navigate(`/accounting/reports/daily/khata?${q}`)}
            aria-label="Khata ledger"
          >
            <div className="text-2xl mb-1">📒</div>
            <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Khata ledger</div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Debits (on credit)</span>
                <span className="font-mono font-semibold text-foreground">
                  {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.khataDebitTotal ?? 0)}`}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Credits (payments)</span>
                <span className="font-mono font-semibold text-foreground">
                  {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.khataCreditTotal ?? 0)}`}
                </span>
              </div>
            </div>
            <div className="text-lg font-semibold text-foreground mt-2">
              Net {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.khataNetChange ?? 0)}`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {loading ? '—' : `${summary?.khataEntryCount ?? 0} entries · all locations`}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 font-semibold">Click for detail →</div>
          </button>
        </div>

        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/40 p-5">
          <div className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">Net profit (daily)</div>
          <div className="text-2xl font-semibold text-emerald-900 dark:text-emerald-200 mt-1">
            {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.netProfitDaily ?? 0)}`}
          </div>
          <div className="text-xs text-emerald-800/80 dark:text-emerald-300/90 mt-1">
            Line margin: sale subtotal − cost (unit snapshot or product cost); same-day returns reduce margin.
          </div>
        </div>
      </div>
    </ReportShell>
  );
};

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
