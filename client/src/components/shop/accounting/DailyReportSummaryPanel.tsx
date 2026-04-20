import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { accountingApi } from '../../../services/shopApi';
import { useBranch } from '../../../context/BranchContext';
import { CURRENCY } from '../../../constants';
import { getApiBaseUrl } from '../../../config/apiUrl';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Select from '../../ui/Select';

export function useDailyReportStream(onUpdate: () => void) {
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

export type DailyReportSummaryPanelProps = {
  /**
   * When true, date and branch follow URL search params (accounting daily report route).
   * When false, filters are local — for embedding on the main dashboard.
   */
  urlSync?: boolean;
  className?: string;
};

const DailyReportSummaryPanel: React.FC<DailyReportSummaryPanelProps> = ({ urlSync = false, className = '' }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { branches } = useBranch();

  const [localDate, setLocalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [localBranchId, setLocalBranchId] = useState<string | null>(null);

  const date = urlSync ? searchParams.get('date') || new Date().toISOString().slice(0, 10) : localDate;
  const branchParam = urlSync ? searchParams.get('branchId') : localBranchId === null ? null : localBranchId;
  const branchId =
    branchParam === '' || branchParam === 'all' || branchParam == null ? null : branchParam;

  const [summary, setSummary] = useState<Awaited<ReturnType<typeof accountingApi.dailyReportSummary>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let d: string;
      let br: string | null;
      if (urlSync) {
        d = searchParams.get('date') || new Date().toISOString().slice(0, 10);
        const bp = searchParams.get('branchId');
        br = bp === '' || bp === 'all' || bp == null ? null : bp;
      } else {
        d = localDate;
        br = localBranchId;
      }
      const data = await accountingApi.dailyReportSummary(d, br);
      setSummary(data);
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to load report');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [urlSync, searchParams, localDate, localBranchId]);

  useDailyReportStream(load);

  useEffect(() => {
    load();
  }, [load]);

  const setDate = (v: string) => {
    if (urlSync) {
      const next = new URLSearchParams(searchParams);
      next.set('date', v);
      setSearchParams(next);
    } else {
      setLocalDate(v);
    }
  };

  const setBranchFilter = (v: string) => {
    if (urlSync) {
      const next = new URLSearchParams(searchParams);
      if (!v || v === 'all') next.delete('branchId');
      else next.set('branchId', v);
      setSearchParams(next);
    } else {
      setLocalBranchId(!v || v === 'all' ? null : v);
    }
  };

  const q = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('date', date);
    if (branchId) qs.set('branchId', branchId);
    return qs.toString();
  }, [date, branchId]);

  const cardClass =
    'rounded-2xl border border-border dark:border-slate-700 bg-card dark:bg-slate-900/60 p-5 shadow-sm transition hover:border-indigo-500/40 dark:hover:border-indigo-400/40 hover:shadow-md cursor-pointer text-left';

  const selectBranchValue = branchId || 'all';

  return (
    <div className={`w-full min-w-0 space-y-6 ${className}`}>
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
          <Select label="Branch" value={selectBranchValue} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">All locations</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex shrink-0 flex-col">
          <span className="mb-1.5 block text-sm font-medium text-foreground invisible select-none" aria-hidden="true">
            Action
          </span>
          <Button variant="secondary" onClick={() => load()} disabled={loading} className="flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <button type="button" className={cardClass} onClick={() => {}} aria-label="POS sales">
          <div className="mb-1 text-2xl">🧾</div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">POS sales (gross)</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.posSales ?? 0)}`}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">shop_sales (branch POS)</div>
        </button>

        <button type="button" className={cardClass} onClick={() => {}} aria-label="POS returns">
          <div className="mb-1 text-2xl">↩️</div>
          <div className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">POS returns</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.posReturns ?? 0)}`}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">shop_sales_returns</div>
        </button>

        <button type="button" className={cardClass} onClick={() => {}} aria-label="Net POS sales">
          <div className="mb-1 text-2xl">📊</div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Net POS sales</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.netPosSales ?? 0)}`}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Gross POS − returns</div>
        </button>

        <button type="button" className={cardClass} onClick={() => {}} aria-label="Mobile sales">
          <div className="mb-1 text-2xl">📱</div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mobile sales</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.mobileSales ?? 0)}`}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">mobile_orders (non-cancelled)</div>
        </button>

        <button
          type="button"
          className={cardClass}
          onClick={() => navigate(`/accounting/reports/daily/inventory-out?${q}`)}
          aria-label="Inventory out"
        >
          <div className="mb-1 text-2xl">📦</div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inventory out</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? '—' : formatQty(summary?.inventoryOutQty ?? 0)}
          </div>
          <div className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">Click for detail →</div>
        </button>

        <button
          type="button"
          className={cardClass}
          onClick={() => navigate(`/accounting/reports/daily/inventory-in?${q}`)}
          aria-label="Inventory in"
        >
          <div className="mb-1 text-2xl">📥</div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inventory in (procurement)</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? '—' : formatQty(summary?.inventoryInQty ?? 0)}
          </div>
          <div className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">Click for detail →</div>
        </button>

        <button
          type="button"
          className={cardClass}
          onClick={() => navigate(`/accounting/reports/daily/expenses?${q}`)}
          aria-label="Expenses"
        >
          <div className="mb-1 text-2xl">💸</div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total expenses</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.totalExpenses ?? 0)}`}
          </div>
          <div className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">Click for detail →</div>
        </button>

        <button
          type="button"
          className={cardClass}
          onClick={() => navigate(`/accounting/reports/daily/products-created?${q}`)}
          aria-label="New products"
        >
          <div className="mb-1 text-2xl">🏷️</div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New products</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? '—' : summary?.newProductsCount ?? 0}
          </div>
          <div className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">Click for detail →</div>
        </button>

        <button
          type="button"
          className={cardClass}
          onClick={() => navigate(`/accounting/reports/daily/khata?${q}`)}
          aria-label="Khata ledger"
        >
          <div className="mb-1 text-2xl">📒</div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Khata ledger</div>
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
          <div className="mt-2 text-lg font-semibold text-foreground">
            Net {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.khataNetChange ?? 0)}`}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {loading ? '—' : `${summary?.khataEntryCount ?? 0} entries · all locations`}
          </div>
          <div className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">Click for detail →</div>
        </button>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 dark:border-emerald-800/50 dark:bg-emerald-950/40">
        <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Net profit (daily)</div>
        <div className="mt-1 text-2xl font-semibold text-emerald-900 dark:text-emerald-200">
          {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.netProfitDaily ?? 0)}`}
        </div>
        <div className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/90">
          Line margin: sale subtotal − cost (unit snapshot or product cost); same-day returns reduce margin.
        </div>
      </div>
    </div>
  );
};

export default DailyReportSummaryPanel;
