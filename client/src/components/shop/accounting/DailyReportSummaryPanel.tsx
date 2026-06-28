import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  RefreshCw,
  Package,
  PackagePlus,
  Banknote,
  Tag,
  BookMarked,
  ChevronRight,
  CreditCard,
} from 'lucide-react';
import { accountingApi } from '../../../services/shopApi';
import { useBranch } from '../../../context/BranchContext';
import { CURRENCY } from '../../../constants';
import { getApiBaseUrl } from '../../../config/apiUrl';
import { useShopTimezone } from '../../../context/ShopTimezoneContext';
import { weekToDateRangeIso } from '../../../utils/shopTimezone';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import StatCard from '../../dashboard/StatCard';
import AssetVelocityPanel, { type AssetVelocityData } from '../../dashboard/AssetVelocityPanel';
import RecentActivitySection from '../../dashboard/RecentActivitySection';

const DailyHourlyTrendChart = lazy(() => import('../../dashboard/DailyHourlyTrendChart'));

const DAILY_REPORT_REFRESH_TYPES = new Set(['daily_report_updated', 'sales_return_created']);

export function useDailyReportStream(onUpdate: () => void, enabled = true) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onUpdateRef.current();
      }, 400);
    };

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
                      if (DAILY_REPORT_REFRESH_TYPES.has(payload.type)) {
                        scheduleRefresh();
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
    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled]);
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
  const { todayYmd, timezone } = useShopTimezone();
  const shopToday = todayYmd();

  const [localDate, setLocalDate] = useState(() => shopToday);
  const [localBranchId, setLocalBranchId] = useState<string | null>(null);

  const urlDate = searchParams.get('date') || shopToday;
  const urlBranchRaw = searchParams.get('branchId');
  const urlBranchId =
    urlBranchRaw === '' || urlBranchRaw === 'all' || urlBranchRaw == null ? null : urlBranchRaw;

  const date = urlSync ? urlDate : localDate;
  const branchId = urlSync ? urlBranchId : localBranchId;

  const [summary, setSummary] = useState<Awaited<ReturnType<typeof accountingApi.dailyReportSummary>> | null>(null);
  const [hourlyTrend, setHourlyTrend] = useState<{ hour: number; label: string; revenue: number; orders: number }[]>([]);
  const [hourlyLoading, setHourlyLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetVelocity, setAssetVelocity] = useState<AssetVelocityData>(null);
  const [assetLoading, setAssetLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAssetLoading(true);
      try {
        const range = weekToDateRangeIso(timezone);
        const raw = await accountingApi.getInventoryValueTrend(range.fromIso, range.toIso);
        if (cancelled) return;
        const points = (raw?.days ?? []).map((d) => {
          const [y, m, day] = String(d.day).slice(0, 10).split('-').map(Number);
          const dt = new Date(Date.UTC(y, m - 1, day, 12));
          return {
            label: dt.toLocaleDateString('en', { weekday: 'short', timeZone: timezone }),
            costValue: Math.round((Number(d.costValue) || 0) * 100) / 100,
            retailValue: Math.round((Number(d.retailValue) || 0) * 100) / 100,
          };
        });
        setAssetVelocity({
          points,
          costNow: Number(raw?.costNow) || 0,
          retailNow: Number(raw?.retailNow) || 0,
          costStart: Number(raw?.costStart) || 0,
          retailStart: Number(raw?.retailStart) || 0,
        });
      } catch {
        if (!cancelled) setAssetVelocity(null);
      } finally {
        if (!cancelled) setAssetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timezone]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await accountingApi.dailyReportSummary(date, branchId);
      setSummary(data);
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to load report');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [date, branchId]);

  const loadHourly = useCallback(async () => {
    setHourlyLoading(true);
    try {
      const res = await accountingApi.hourlyTrend(date, branchId);
      setHourlyTrend(Array.isArray(res?.hours) ? res.hours : []);
    } catch {
      setHourlyTrend([]);
    } finally {
      setHourlyLoading(false);
    }
  }, [date, branchId]);

  // Full daily report page: dedicated SSE. Embedded dashboard: shared ShopRealtimeBridge event.
  useDailyReportStream(() => {
    load();
    loadHourly();
  }, urlSync);

  useEffect(() => {
    if (urlSync) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = (e: Event) => {
      const type = (e as CustomEvent<{ type?: string }>).detail?.type;
      if (!type || !DAILY_REPORT_REFRESH_TYPES.has(type)) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        load();
        loadHourly();
      }, 400);
    };
    window.addEventListener('shop:realtime', onRealtime as EventListener);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('shop:realtime', onRealtime as EventListener);
    };
  }, [urlSync, load, loadHourly]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadHourly();
  }, [loadHourly]);

  const hourlyDateLabel = useMemo(() => {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }, [date]);

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
          <Button variant="secondary" onClick={() => { load(); loadHourly(); }} disabled={loading} className="flex items-center gap-1.5 text-sm">
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
          <StatCard label="POS gross" value={`${CURRENCY} ${formatMoney(summary?.posSales ?? 0)}`} accentClass="bg-sky-500" loading={loading} />
          <StatCard label="POS returns" value={`${CURRENCY} ${formatMoney(summary?.posReturns ?? 0)}`} accentClass="bg-rose-500" loading={loading} />
          <StatCard label="Net POS" value={`${CURRENCY} ${formatMoney(summary?.netPosSales ?? 0)}`} accentClass="bg-emerald-500" loading={loading} />
          <StatCard label="Mobile gross" value={`${CURRENCY} ${formatMoney(summary?.mobileSales ?? 0)}`} accentClass="bg-violet-500" loading={loading} />
          <StatCard label="Mobile ret." value={`${CURRENCY} ${formatMoney(summary?.mobileReturns ?? 0)}`} accentClass="bg-rose-500" loading={loading} />
          <StatCard label="Net mobile" value={`${CURRENCY} ${formatMoney(summary?.netMobileSales ?? 0)}`} accentClass="bg-violet-500" loading={loading} />
          <StatCard label="Net sales" value={`${CURRENCY} ${formatMoney(summary?.netTotalSales ?? 0)}`} highlight loading={loading} />
        </div>
      </div>

      {/* Hourly trend + asset velocity */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr] xl:items-stretch">
        <Suspense
          fallback={<div className="h-[280px] animate-pulse rounded-[10px] bg-gray-200 dark:bg-gray-700" />}
        >
          <DailyHourlyTrendChart loading={hourlyLoading} data={hourlyTrend} dateLabel={hourlyDateLabel} />
        </Suspense>
        <AssetVelocityPanel data={assetVelocity} loading={assetLoading} />
      </div>

      {/* Operations */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Operations</span>
          <span className="h-px min-w-[2rem] flex-1 bg-border dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            label="Inventory out"
            value={formatQty(summary?.inventoryOutQty ?? 0)}
            sub="Units sold today"
            accentClass="bg-amber-500"
            icon={Package}
            iconClass="text-amber-600 dark:text-amber-400"
            loading={loading}
            onClick={() => navigate(`/accounting/reports/daily/inventory-out?${q}`)}
          />
          <StatCard
            label="Inventory in"
            value={formatQty(summary?.inventoryInQty ?? 0)}
            sub="Procurement & returns"
            accentClass="bg-teal-500"
            icon={PackagePlus}
            iconClass="text-teal-600 dark:text-teal-400"
            loading={loading}
            onClick={() => navigate(`/accounting/reports/daily/inventory-in?${q}`)}
          />
          <StatCard
            label="Vendor payments"
            value={`${CURRENCY} ${formatMoney(summary?.vendorPaymentsTotal ?? 0)}`}
            sub="Supplier settlements"
            accentClass="bg-blue-500"
            icon={CreditCard}
            iconClass="text-blue-600 dark:text-blue-400"
            loading={loading}
            onClick={() => navigate('/procurement')}
          />
          <StatCard
            label="Expenses"
            value={`${CURRENCY} ${formatMoney(summary?.totalExpenses ?? 0)}`}
            sub="Operational costs"
            accentClass="bg-orange-500"
            icon={Banknote}
            iconClass="text-orange-600 dark:text-orange-400"
            loading={loading}
            onClick={() => navigate(`/accounting/reports/daily/expenses?${q}`)}
          />
          <StatCard
            label="New items"
            value={String(summary?.newProductsCount ?? 0)}
            sub="Created today"
            accentClass="bg-fuchsia-500"
            icon={Tag}
            iconClass="text-fuchsia-600 dark:text-fuchsia-400"
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

      <RecentActivitySection />
    </div>
  );
};

export default DailyReportSummaryPanel;
