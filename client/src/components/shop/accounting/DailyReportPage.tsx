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
                      if (payload.type === 'daily_report_updated') {
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
  <div className="flex flex-col h-full bg-slate-50 -m-4 md:-m-8">
    <div className="bg-white border-b border-slate-200 px-8 pt-6 shadow-sm z-10">
      <h1 className="text-2xl font-black text-slate-800 tracking-tight">{title}</h1>
      <p className="text-slate-500 text-sm font-medium mt-1">Single source of truth — POS, mobile, inventory, expenses.</p>
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
    'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md cursor-pointer text-left';

  return (
    <ReportShell title="Daily Report">
      <div className="max-w-6xl mx-auto space-y-6">
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
            <span className="block text-sm font-medium text-gray-700 mb-1.5 invisible select-none" aria-hidden="true">
              Action
            </span>
            <Button variant="secondary" onClick={() => load()} disabled={loading} className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button type="button" className={cardClass} onClick={() => {}} aria-label="POS sales">
            <div className="text-2xl mb-1">🧾</div>
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">POS sales</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.posSales ?? 0)}`}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">shop_sales (branch POS)</div>
          </button>

          <button type="button" className={cardClass} onClick={() => {}} aria-label="Mobile sales">
            <div className="text-2xl mb-1">📱</div>
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Mobile sales</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.mobileSales ?? 0)}`}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">mobile_orders (non-cancelled)</div>
          </button>

          <button
            type="button"
            className={cardClass}
            onClick={() => navigate(`/accounting/reports/daily/inventory-out?${q}`)}
            aria-label="Inventory out"
          >
            <div className="text-2xl mb-1">📦</div>
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Inventory out</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {loading ? '—' : formatQty(summary?.inventoryOutQty ?? 0)}
            </div>
            <div className="text-[11px] text-indigo-600 mt-2 font-semibold">Click for detail →</div>
          </button>

          <button
            type="button"
            className={cardClass}
            onClick={() => navigate(`/accounting/reports/daily/inventory-in?${q}`)}
            aria-label="Inventory in"
          >
            <div className="text-2xl mb-1">📥</div>
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Inventory in (procurement)</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {loading ? '—' : formatQty(summary?.inventoryInQty ?? 0)}
            </div>
            <div className="text-[11px] text-indigo-600 mt-2 font-semibold">Click for detail →</div>
          </button>

          <button
            type="button"
            className={cardClass}
            onClick={() => navigate(`/accounting/reports/daily/expenses?${q}`)}
            aria-label="Expenses"
          >
            <div className="text-2xl mb-1">💸</div>
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Total expenses</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.totalExpenses ?? 0)}`}
            </div>
            <div className="text-[11px] text-indigo-600 mt-2 font-semibold">Click for detail →</div>
          </button>

          <button
            type="button"
            className={cardClass}
            onClick={() => navigate(`/accounting/reports/daily/products-created?${q}`)}
            aria-label="New products"
          >
            <div className="text-2xl mb-1">🏷️</div>
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">New products</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {loading ? '—' : summary?.newProductsCount ?? 0}
            </div>
            <div className="text-[11px] text-indigo-600 mt-2 font-semibold">Click for detail →</div>
          </button>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
          <div className="text-xs font-bold uppercase text-emerald-700 tracking-wider">Net profit (daily)</div>
          <div className="text-2xl font-black text-emerald-900 mt-1">
            {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.netProfitDaily ?? 0)}`}
          </div>
          <div className="text-xs text-emerald-800/80 mt-1">POS + Mobile sales − expenses (same day)</div>
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
      <div className="max-w-5xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/accounting/reports/daily?${searchParams.toString()}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to daily report
        </button>
        <p className="text-sm text-slate-600">
          Date <span className="font-mono font-semibold">{date}</span>
          {branchId ? (
            <>
              {' '}
              · Branch <span className="font-mono text-xs">{branchId}</span>
            </>
          ) : null}
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-[10px] uppercase font-black text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Item</th>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-right px-4 py-3">Qty out</th>
                <th className="text-left px-4 py-3">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No stock movements out for this day.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.item_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{r.item_name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.sku}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatQty(Number(r.total_qty_out))}</td>
                    <td className="px-4 py-2 text-slate-600">{r.unit}</td>
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
      <div className="max-w-5xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/accounting/reports/daily?${searchParams.toString()}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to daily report
        </button>
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-[10px] uppercase font-black text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Item</th>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-right px-4 py-3">Qty in</th>
                <th className="text-left px-4 py-3">Unit</th>
                <th className="text-left px-4 py-3">Supplier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No purchase receipts for this day.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.item_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{r.item_name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.sku}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatQty(Number(r.total_qty_in))}</td>
                    <td className="px-4 py-2 text-slate-600">{r.unit}</td>
                    <td className="px-4 py-2 text-slate-600">{r.supplier || '—'}</td>
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
      <div className="max-w-5xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/accounting/reports/daily?${searchParams.toString()}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to daily report
        </button>
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-[10px] uppercase font-black text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Notes</th>
                <th className="text-left px-4 py-3">Paid from</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No expenses for this day.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs">{r.date}</td>
                    <td className="px-4 py-2">{r.expense_category}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {CURRENCY} {formatMoney(Number(r.amount))}
                    </td>
                    <td className="px-4 py-2 text-slate-600 max-w-xs truncate" title={r.notes}>
                      {r.notes || '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.paid_from_account || '—'}</td>
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
      <div className="max-w-5xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/accounting/reports/daily?${searchParams.toString()}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to daily report
        </button>
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-[10px] uppercase font-black text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Created by</th>
                <th className="text-left px-4 py-3">Created at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No new SKUs for this day.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.sku}-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                    <td className="px-4 py-2 font-medium">{r.product_name}</td>
                    <td className="px-4 py-2 text-slate-600">{r.category || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{r.created_by || '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.created_at}</td>
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
      <Route path="*" element={<Navigate to="/accounting/reports/daily" replace />} />
    </Routes>
  );
};

export default DailyReportPage;
