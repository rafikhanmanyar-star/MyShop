import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { shopApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import {
  RefreshCw,
  Plus,
  Eye,
  Calendar,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  Truck,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0
  );
}

function formatMoneyFull(n: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );
}

function parseTs(v: unknown): number {
  if (v == null) return 0;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : 0;
}

function parseAmount(v: unknown): number {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

type RowStatus = { label: string; dotClass: string };

function syntheticStatus(r: { refundMethod?: string }): RowStatus {
  const m = String(r.refundMethod || '').toUpperCase();
  if (m === 'BANK') return { label: 'In review', dotClass: 'bg-amber-500' };
  if (m === 'ADJUSTMENT') return { label: 'Pending', dotClass: 'bg-slate-400' };
  return { label: 'Refunded', dotClass: 'bg-emerald-500' };
}

const REASON_PALETTE = {
  full: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
  partial: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
  note: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
};

function reasonBadge(r: { returnType?: string; notes?: string | null }) {
  const n = (r.notes || '').trim().toLowerCase();
  if (n.includes('damage') || n.includes('defect')) {
    return { label: 'Damaged', className: REASON_PALETTE.full };
  }
  if (n.includes('wrong')) {
    return { label: 'Wrong item', className: REASON_PALETTE.partial };
  }
  if (String(r.returnType).toUpperCase() === 'FULL') {
    return { label: 'Full return', className: REASON_PALETTE.note };
  }
  return { label: 'Partial', className: REASON_PALETTE.partial };
}

const DONUT_COLORS = ['#1e3a8a', '#3b82f6', '#f97316', '#93c5fd'];

export default function SalesReturnListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [rangeStart, setRangeStart] = useState(() => toYmd(startOfMonth(now)));
  const [rangeEnd, setRangeEnd] = useState(() => toYmd(endOfMonth(now)));

  const [productType, setProductType] = useState<'all' | 'pos' | 'mobile'>('all');
  const [reasonFilter, setReasonFilter] = useState<'all' | 'FULL' | 'PARTIAL'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'refunded' | 'review' | 'pending'>('all');
  const [trendMode, setTrendMode] = useState<'weekly' | 'monthly'>('weekly');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [retData, saleData] = await Promise.all([
        shopApi.getSalesReturns(),
        shopApi.getSales().catch(() => []),
      ]);
      setRows(Array.isArray(retData) ? retData : []);
      setSales(Array.isArray(saleData) ? saleData : []);
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to load');
      setRows([]);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const h = () => void load();
    window.addEventListener('shop:realtime', h as EventListener);
    return () => window.removeEventListener('shop:realtime', h as EventListener);
  }, [load]);

  const rangeBounds = useMemo(() => {
    const a = new Date(rangeStart + 'T00:00:00');
    const b = new Date(rangeEnd + 'T23:59:59');
    return { start: a.getTime(), end: b.getTime() };
  }, [rangeStart, rangeEnd]);

  const inRange = useCallback(
    (t: number) => t >= rangeBounds.start && t <= rangeBounds.end,
    [rangeBounds]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const t = parseTs(r.returnDate ?? r.return_date);
      if (!inRange(t)) return false;
      if (productType === 'pos' && String(r.source) !== 'pos') return false;
      if (productType === 'mobile' && String(r.source) !== 'mobile') return false;
      if (reasonFilter !== 'all' && String(r.returnType).toUpperCase() !== reasonFilter) return false;
      const st = syntheticStatus(r);
      if (statusFilter === 'refunded' && st.label !== 'Refunded') return false;
      if (statusFilter === 'review' && st.label !== 'In review') return false;
      if (statusFilter === 'pending' && st.label !== 'Pending') return false;
      return true;
    });
  }, [rows, inRange, productType, reasonFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [rangeStart, rangeEnd, productType, reasonFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const salesInRange = useMemo(() => {
    return sales.filter((s) => {
      const t = parseTs(s.createdAt ?? s.created_at);
      return inRange(t);
    });
  }, [sales, inRange]);

  const kpis = useMemo(() => {
    const retVal = filteredRows.reduce((s, r) => s + parseAmount(r.totalReturnAmount ?? r.total_return_amount), 0);
    const saleVal = salesInRange.reduce((s, x) => s + parseAmount(x.grandTotal ?? x.grand_total), 0);
    const returnRate = saleVal > 0 ? (retVal / saleVal) * 100 : 0;

    const periodMs = Math.max(1, rangeBounds.end - rangeBounds.start);
    const prevEnd = rangeBounds.start - 1;
    const prevStart = prevEnd - periodMs;
    const prevReturns = rows.filter((r) => {
      const t = parseTs(r.returnDate ?? r.return_date);
      return t >= prevStart && t <= prevEnd;
    });
    const prevSales = sales.filter((x) => {
      const t = parseTs(x.createdAt ?? x.created_at);
      return t >= prevStart && t <= prevEnd;
    });
    const prevRetVal = prevReturns.reduce((s, r) => s + parseAmount(r.totalReturnAmount ?? r.total_return_amount), 0);
    const prevSaleVal = prevSales.reduce((s, x) => s + parseAmount(x.grandTotal ?? x.grand_total), 0);
    const prevRate = prevSaleVal > 0 ? (prevRetVal / prevSaleVal) * 100 : 0;
    const rateDelta = returnRate - prevRate;

    let refundAmt = 0;
    let exchangeAmt = 0;
    for (const r of filteredRows) {
      const amt = parseAmount(r.totalReturnAmount ?? r.total_return_amount);
      if (String(r.refundMethod).toUpperCase() === 'ADJUSTMENT') exchangeAmt += amt;
      else refundAmt += amt;
    }
    let refundPct = 0;
    let exchangePct = 0;
    if (refundAmt + exchangeAmt > 0) {
      refundPct = Math.round((refundAmt / (refundAmt + exchangeAmt)) * 100);
      exchangePct = 100 - refundPct;
    }

    const pendingRefunds = filteredRows.filter((r) => String(r.refundMethod).toUpperCase() === 'BANK').length;

    const criticalAlerts = filteredRows.filter((r) => parseAmount(r.totalReturnAmount ?? r.total_return_amount) >= 50000).length;

    return {
      returnRate,
      rateDelta,
      retVal,
      refundPct,
      exchangePct,
      pendingRefunds,
      criticalAlerts,
    };
  }, [filteredRows, salesInRange, rows, sales, rangeBounds]);

  const trendData = useMemo(() => {
    const list = filteredRows;
    if (trendMode === 'weekly') {
      const labels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      const counts = [0, 0, 0, 0, 0, 0, 0];
      for (const r of list) {
        const d = new Date(parseTs(r.returnDate ?? r.return_date));
        let idx = d.getDay() - 1;
        if (idx < 0) idx = 6;
        counts[idx] += 1;
      }
      const max = Math.max(1, ...counts);
      return labels.map((name, i) => ({
        name,
        value: counts[i],
        fill: counts[i] === max && counts[i] > 0 ? '#1e3a8a' : '#bfdbfe',
      }));
    }
    const byDay: Record<string, number> = {};
    let cursor = new Date(rangeBounds.start);
    const end = new Date(rangeBounds.end);
    while (cursor <= end) {
      byDay[toYmd(cursor)] = 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const r of list) {
      const d = new Date(parseTs(r.returnDate ?? r.return_date));
      const key = toYmd(d);
      if (byDay[key] != null) byDay[key] += 1;
    }
    const entries = Object.entries(byDay);
    const max = Math.max(1, ...entries.map(([, v]) => v));
    return entries.map(([day, value]) => {
      const short = day.slice(8);
      return {
        name: short,
        value,
        fill: value === max && value > 0 ? '#1e3a8a' : '#bfdbfe',
      };
    });
  }, [filteredRows, trendMode, rangeBounds]);

  const donutData = useMemo(() => {
    const buckets: Record<string, number> = {
      Cash: 0,
      Bank: 0,
      Wallet: 0,
      'Store credit': 0,
    };
    let totalItems = 0;
    for (const r of filteredRows) {
      totalItems += 1;
      const m = String(r.refundMethod || '').toUpperCase();
      if (m === 'CASH') buckets.Cash += 1;
      else if (m === 'BANK') buckets.Bank += 1;
      else if (m === 'WALLET') buckets.Wallet += 1;
      else buckets['Store credit'] += 1;
    }
    const entries = Object.entries(buckets).filter(([, v]) => v > 0);
    if (entries.length === 0) {
      return { chart: [{ name: 'No data', value: 1 }], totalItems: 0, percents: [] as { name: string; pct: number }[] };
    }
    const chart = entries.map(([name, value]) => ({ name, value }));
    const percents = entries.map(([name, value]) => ({
      name,
      pct: Math.round((value / totalItems) * 100),
    }));
    return { chart, totalItems, percents };
  }, [filteredRows]);

  const insightPills = useMemo(() => {
    const byCustomer = new Map<string, number>();
    for (const r of filteredRows) {
      const name = String(r.customerName || 'Walk-in').trim() || 'Walk-in';
      byCustomer.set(name, (byCustomer.get(name) || 0) + 1);
    }
    let topReturner = '';
    let topCount = 0;
    for (const [name, c] of byCustomer) {
      if (c > topCount) {
        topCount = c;
        topReturner = name;
      }
    }
    const adj = filteredRows.filter((r) => String(r.refundMethod).toUpperCase() === 'ADJUSTMENT').length;
    const adjPct = filteredRows.length ? Math.round((adj / filteredRows.length) * 100) : 0;

    const damageLike = filteredRows.filter((r) => reasonBadge(r).label === 'Damaged').length;
    const dmgPct = filteredRows.length ? Math.round((damageLike / filteredRows.length) * 100) : 0;

    return { topReturner, adjPct, dmgPct };
  }, [filteredRows]);

  const pageSafe = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageSafe]);

  const rangeLabel = useMemo(() => {
    const a = new Date(rangeStart + 'T12:00:00');
    const b = new Date(rangeEnd + 'T12:00:00');
    const o: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit' };
    return `${a.toLocaleDateString(undefined, o)} - ${b.toLocaleDateString(undefined, o)}`;
  }, [rangeStart, rangeEnd]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-8">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card-val)] pl-1 border-l-4 border-l-primary-600 overflow-hidden">
          <div className="p-4 pl-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Return rate</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-2xl font-bold text-foreground tabular-nums">
                {loading ? '—' : `${returnRateDisplay(kpis.returnRate)}%`}
              </div>
              {!loading && kpis.rateDelta !== 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    kpis.rateDelta > 0
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {kpis.rateDelta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {Math.abs(kpis.rateDelta).toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Vs previous period of same length</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card-val)] pl-1 border-l-4 border-l-primary-600 overflow-hidden">
          <div className="p-4 pl-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total return value</div>
            <div className="text-2xl font-bold text-foreground tabular-nums mt-1">
              {loading ? '—' : `${CURRENCY} ${formatMoney(kpis.retVal)}`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Selected range</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card-val)] pl-1 border-l-4 border-l-primary-600 overflow-hidden">
          <div className="p-4 pl-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Refund vs store credit</div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-primary-100 dark:bg-primary-950/40 overflow-hidden flex">
              <div
                className="h-full bg-primary-900 transition-all"
                style={{ width: `${kpis.refundPct}%` }}
                title="Refund methods"
              />
              <div
                className="h-full bg-primary-300 transition-all"
                style={{ width: `${kpis.exchangePct}%` }}
                title="Store credit"
              />
            </div>
            <div className="flex justify-between text-xs font-semibold mt-2 text-foreground">
              <span>{kpis.refundPct}% refund</span>
              <span className="text-muted-foreground">{kpis.exchangePct}% credit</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card-val)] pl-1 border-l-4 border-l-orange-500 overflow-hidden">
          <div className="p-4 pl-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pending refunds</div>
            <div className="mt-1 flex items-center justify-between">
              <div className="text-2xl font-bold text-orange-600 tabular-nums">{loading ? '—' : kpis.pendingRefunds}</div>
              <Clock className="w-8 h-8 text-orange-400 opacity-90" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Bank transfer in review</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card-val)] pl-1 border-l-4 border-l-red-600 overflow-hidden sm:col-span-2 xl:col-span-1">
          <div className="p-4 pl-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Critical alerts</div>
            <div className="mt-1 flex items-center justify-between">
              <div className="text-2xl font-bold text-red-600 tabular-nums">{loading ? '—' : kpis.criticalAlerts}</div>
              <AlertTriangle className="w-8 h-8 text-red-400 opacity-90" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{CURRENCY} 50k+ return value</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card-val)]">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-foreground">Returns trend</h2>
            <div className="flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTrendMode('weekly')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  trendMode === 'weekly'
                    ? 'bg-primary-900 text-white dark:bg-primary-700'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setTrendMode('monthly')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  trendMode === 'monthly'
                    ? 'bg-primary-900 text-white dark:bg-primary-700'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
          <div className="h-64 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: 'var(--accent)' }}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {trendData.map((e, i) => (
                      <Cell key={i} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card-val)]">
          <h2 className="text-base font-bold text-foreground mb-4">Return methods</h2>
          <div className="h-56 w-full flex flex-col items-center">
            {loading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
            ) : donutData.totalItems === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No returns in range</div>
            ) : (
              <>
                <div className="h-52 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData.chart}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="58%"
                        outerRadius="82%"
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {donutData.chart.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-2">
                    <div className="text-center">
                      <div className="text-xl font-bold text-foreground tabular-nums">{donutData.totalItems}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total returns</div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
                  {donutData.percents.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                      />
                      {p.name}: {p.pct}%
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Insight pills */}
      <div className="flex flex-wrap justify-center gap-2">
        {insightPills.dmgPct > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-900 dark:bg-red-950/30 dark:border-red-900 dark:text-red-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {insightPills.dmgPct}% flagged damaged / defect (notes)
          </div>
        )}
        {insightPills.adjPct > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-900 dark:bg-orange-950/30 dark:border-orange-900 dark:text-orange-200">
            <Truck className="w-3.5 h-3.5 shrink-0" />
            {insightPills.adjPct}% store credit (adjustment)
          </div>
        )}
        {insightPills.topReturner && filteredRows.length > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-900 dark:bg-primary-950/30 dark:border-primary-800 dark:text-primary-200">
            <User className="w-3.5 h-3.5 shrink-0" />
            Top returner: {insightPills.topReturner}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Table card */}
      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card-val)] overflow-hidden">
        <div className="flex flex-col gap-4 p-4 border-b border-border bg-muted/30 dark:bg-slate-900/40 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-foreground">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                aria-label="Filter returns from date"
                className="bg-transparent border-none text-sm p-0 focus:ring-0 w-[9.5rem]"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                aria-label="Filter returns to date"
                className="bg-transparent border-none text-sm p-0 focus:ring-0 w-[9.5rem]"
              />
            </div>
            <span className="text-xs text-muted-foreground hidden md:inline">{rangeLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              hideIcon
              className="!py-2 !rounded-full !text-xs font-medium min-w-[8.5rem]"
              value={productType}
              onChange={(e) => setProductType(e.target.value as typeof productType)}
            >
              <option value="all">All channels</option>
              <option value="pos">POS</option>
              <option value="mobile">Mobile</option>
            </Select>
            <Select
              hideIcon
              className="!py-2 !rounded-full !text-xs font-medium min-w-[7.5rem]"
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as typeof reasonFilter)}
            >
              <option value="all">Reason</option>
              <option value="FULL">Full return</option>
              <option value="PARTIAL">Partial</option>
            </Select>
            <Select
              hideIcon
              className="!py-2 !rounded-full !text-xs font-medium min-w-[7.5rem]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">Status</option>
              <option value="refunded">Refunded</option>
              <option value="review">In review</option>
              <option value="pending">Pending</option>
            </Select>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5 !min-h-0 py-2" type="button">
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading} className="rounded-full gap-1.5">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              type="button"
              className="rounded-full gap-2 bg-primary-900 hover:bg-primary-950 dark:bg-primary-700 dark:hover:bg-primary-600 shadow-sm"
              onClick={() => navigate('/sales-returns/new')}
            >
              <Plus className="w-4 h-4" />
              New return
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 dark:bg-slate-800/60 text-left">
                <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">Customer</th>
                <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">Product</th>
                <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground text-right">Qty</th>
                <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground text-right">Amount</th>
                <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">Reason</th>
                <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">
                    No returns in this range.
                  </td>
                </tr>
              ) : (
                pageRows.map((r, idx) => {
                  const st = syntheticStatus(r);
                  const rb = reasonBadge(r);
                  const zebra = idx % 2 === 0 ? 'bg-[var(--table-zebra)]' : '';
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-border/70 hover:bg-[var(--table-row-hover)] transition-colors ${zebra}`}
                    >
                      <td className="px-4 py-3">
                        <Link to={`/sales-returns/${r.id}`} className="font-semibold text-primary-600 hover:underline">
                          {r.returnNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {r.returnDate ? new Date(r.returnDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-800 dark:bg-primary-950 dark:text-primary-200">
                            {initials(String(r.customerName || 'W'))}
                          </span>
                          <span className="truncate font-medium text-foreground">{r.customerName || 'Walk-in'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[10rem] truncate" title={r.originalSaleNumber}>
                        {r.originalSaleNumber || '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">—</td>
                      <td className="px-4 py-3 text-right font-mono font-medium tabular-nums">
                        {CURRENCY} {formatMoneyFull(parseAmount(r.totalReturnAmount))}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${rb.className}`}>
                          {rb.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${st.dotClass}`} />
                          <span className="text-foreground">{st.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/sales-returns/${r.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1 !min-h-0 h-8">
                            <Eye className="w-4 h-4" />
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/20 text-sm">
          <p className="text-muted-foreground">
            Showing{' '}
            <span className="font-medium text-foreground">
              {filteredRows.length === 0 ? 0 : (pageSafe - 1) * pageSize + 1} to{' '}
              {Math.min(pageSafe * pageSize, filteredRows.length)}
            </span>{' '}
            of <span className="font-medium text-foreground">{filteredRows.length}</span> returns
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-md"
              disabled={pageSafe <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-md"
              disabled={pageSafe >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function returnRateDisplay(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  return n.toFixed(2);
}
