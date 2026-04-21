import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  RefreshCw,
  Receipt,
  Undo2,
  ChartColumn,
  Smartphone,
  Sigma,
  Package,
  PackagePlus,
  Banknote,
  Tag,
  BookMarked,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

const ICON_RING = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg';

type MetricCardProps = {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  hint?: string;
  loading: boolean;
  onClick?: () => void;
  labelClassName?: string;
  emphasis?: boolean;
};

function MetricCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  hint,
  loading,
  onClick,
  labelClassName = 'text-muted-foreground',
  emphasis,
}: MetricCardProps) {
  const inner = (
    <>
      <div className="flex items-start gap-2.5">
        <div className={`${ICON_RING} ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-[0.65rem] font-bold uppercase tracking-wide ${labelClassName}`}>{label}</div>
          <div
            className={`mt-0.5 truncate text-base font-semibold tabular-nums leading-tight text-foreground sm:text-lg ${
              emphasis ? 'text-indigo-700 dark:text-indigo-300' : ''
            }`}
          >
            {loading ? '—' : value}
          </div>
          {hint ? (
            <div className="mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-muted-foreground">{hint}</div>
          ) : null}
        </div>
      </div>
    </>
  );

  const cardCls =
    'rounded-xl border border-border/80 bg-card/90 p-3 text-left shadow-sm transition hover:border-indigo-500/35 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-indigo-400/35' +
    (onClick ? ' cursor-pointer hover:shadow-md' : '');

  if (onClick) {
    return (
      <button type="button" className={cardCls} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={cardCls}>{inner}</div>;
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

  const selectBranchValue = branchId || 'all';

  return (
    <div className={`w-full min-w-0 space-y-4 ${className}`}>
      <div
        className="flex flex-wrap items-end gap-3
          [&_input]:!h-9 [&_input]:!min-h-0 [&_input]:!py-1.5 [&_input]:!text-sm
          [&_select]:!h-9 [&_select]:!min-h-0 [&_select]:!py-1.5 [&_select]:!text-sm
          [&_button]:!h-9 [&_button]:!min-h-0 [&_button]:!py-1.5 [&_button]:shrink-0"
      >
        <div className="w-40 shrink-0">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="w-52 shrink-0">
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
          <span className="mb-1 block text-xs font-medium text-foreground invisible select-none" aria-hidden="true">
            Action
          </span>
          <Button variant="secondary" onClick={() => load()} disabled={loading} className="flex items-center gap-1.5 text-sm">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Sales — POS then mobile, then combined net */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sales</span>
          <span className="h-px min-w-[2rem] flex-1 bg-border dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <MetricCard
            icon={Receipt}
            iconBg="bg-sky-500/15 dark:bg-sky-400/10"
            iconColor="text-sky-600 dark:text-sky-400"
            label="POS (gross)"
            value={`${CURRENCY} ${formatMoney(summary?.posSales ?? 0)}`}
            hint="shop_sales"
            loading={loading}
          />
          <MetricCard
            icon={Undo2}
            iconBg="bg-rose-500/15 dark:bg-rose-400/10"
            iconColor="text-rose-600 dark:text-rose-400"
            label="POS returns"
            value={`${CURRENCY} ${formatMoney(summary?.posReturns ?? 0)}`}
            hint="Returns from POS sales"
            loading={loading}
            labelClassName="text-rose-700 dark:text-rose-400"
          />
          <MetricCard
            icon={ChartColumn}
            iconBg="bg-emerald-500/15 dark:bg-emerald-400/10"
            iconColor="text-emerald-600 dark:text-emerald-400"
            label="Net POS"
            value={`${CURRENCY} ${formatMoney(summary?.netPosSales ?? 0)}`}
            hint="Gross − POS returns"
            loading={loading}
          />
          <MetricCard
            icon={Smartphone}
            iconBg="bg-violet-500/15 dark:bg-violet-400/10"
            iconColor="text-violet-600 dark:text-violet-400"
            label="Mobile (gross)"
            value={`${CURRENCY} ${formatMoney(summary?.mobileSales ?? 0)}`}
            hint="mobile_orders (not cancelled)"
            loading={loading}
          />
          <MetricCard
            icon={Undo2}
            iconBg="bg-rose-500/15 dark:bg-rose-400/10"
            iconColor="text-rose-600 dark:text-rose-400"
            label="Mobile returns"
            value={`${CURRENCY} ${formatMoney(summary?.mobileReturns ?? 0)}`}
            hint="Returns from app orders"
            loading={loading}
            labelClassName="text-rose-700 dark:text-rose-400"
          />
          <MetricCard
            icon={Smartphone}
            iconBg="bg-violet-500/15 dark:bg-violet-400/10"
            iconColor="text-violet-600 dark:text-violet-400"
            label="Net mobile"
            value={`${CURRENCY} ${formatMoney(summary?.netMobileSales ?? 0)}`}
            hint="Gross − mobile returns"
            loading={loading}
          />
          <MetricCard
            icon={Sigma}
            iconBg="bg-indigo-500/15 dark:bg-indigo-400/10"
            iconColor="text-indigo-600 dark:text-indigo-400"
            label="Net sales (total)"
            value={`${CURRENCY} ${formatMoney(summary?.netTotalSales ?? 0)}`}
            hint="Net POS + net mobile"
            loading={loading}
            emphasis
          />
        </div>
      </div>

      {/* Operations */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Operations</span>
          <span className="h-px min-w-[2rem] flex-1 bg-border dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard
            icon={Package}
            iconBg="bg-amber-500/12 dark:bg-amber-400/10"
            iconColor="text-amber-700 dark:text-amber-400"
            label="Inventory out"
            value={formatQty(summary?.inventoryOutQty ?? 0)}
            hint="Click for detail"
            loading={loading}
            onClick={() => navigate(`/accounting/reports/daily/inventory-out?${q}`)}
          />
          <MetricCard
            icon={PackagePlus}
            iconBg="bg-teal-500/12 dark:bg-teal-400/10"
            iconColor="text-teal-700 dark:text-teal-400"
            label="Inventory in"
            value={formatQty(summary?.inventoryInQty ?? 0)}
            hint="Procurement & sale returns"
            loading={loading}
            onClick={() => navigate(`/accounting/reports/daily/inventory-in?${q}`)}
          />
          <MetricCard
            icon={Banknote}
            iconBg="bg-orange-500/12 dark:bg-orange-400/10"
            iconColor="text-orange-700 dark:text-orange-400"
            label="Expenses"
            value={`${CURRENCY} ${formatMoney(summary?.totalExpenses ?? 0)}`}
            hint="Click for detail"
            loading={loading}
            onClick={() => navigate(`/accounting/reports/daily/expenses?${q}`)}
          />
          <MetricCard
            icon={Tag}
            iconBg="bg-fuchsia-500/12 dark:bg-fuchsia-400/10"
            iconColor="text-fuchsia-700 dark:text-fuchsia-400"
            label="New products"
            value={String(summary?.newProductsCount ?? 0)}
            hint="Created today"
            loading={loading}
            onClick={() => navigate(`/accounting/reports/daily/products-created?${q}`)}
          />
        </div>
      </div>

      {/* Khata — single compact row */}
      <button
        type="button"
        onClick={() => navigate(`/accounting/reports/daily/khata?${q}`)}
        className="flex w-full flex-col gap-2 rounded-xl border border-border/80 bg-card/90 p-3 text-left shadow-sm transition hover:border-indigo-500/35 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-indigo-400/35 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-2.5">
          <div className={`${ICON_RING} bg-amber-500/15 dark:bg-amber-400/10`}>
            <BookMarked className="h-4 w-4 text-amber-700 dark:text-amber-400" strokeWidth={2} aria-hidden />
          </div>
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">Khata ledger</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                Debits{' '}
                <span className="font-mono font-semibold text-foreground">
                  {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.khataDebitTotal ?? 0)}`}
                </span>
              </span>
              <span className="text-muted-foreground">
                Credits{' '}
                <span className="font-mono font-semibold text-foreground">
                  {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.khataCreditTotal ?? 0)}`}
                </span>
              </span>
              <span className="font-semibold text-foreground">
                Net{' '}
                {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.khataNetChange ?? 0)}`}
              </span>
            </div>
            <div className="mt-0.5 text-[0.65rem] text-muted-foreground">
              {loading ? '—' : `${summary?.khataEntryCount ?? 0} entries · all locations`}
            </div>
          </div>
        </div>
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 sm:shrink-0">
          Detail
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>

      <div className="flex flex-col gap-1 rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-3 py-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/35 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-400/90">
            Net profit (daily)
          </div>
          <div className="text-[0.65rem] text-emerald-800/75 dark:text-emerald-300/80">
            Line margin: sale subtotal − cost; same-day returns reduce margin.
          </div>
        </div>
        <div className="text-lg font-semibold tabular-nums text-emerald-900 dark:text-emerald-200 sm:text-xl">
          {loading ? '—' : `${CURRENCY} ${formatMoney(summary?.netProfitDaily ?? 0)}`}
        </div>
      </div>
    </div>
  );
};

export default DailyReportSummaryPanel;
