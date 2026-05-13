import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../../ui/Card';
import { reportsApi, type ExecutiveSummaryResponse } from '../../../services/reportsApi';

const COLORS = ['#0047AB', '#2563eb', '#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#34d399', '#facc15'];

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border border-slate-200/80 bg-gradient-to-br from-white/95 to-slate-50/90 shadow-sm backdrop-blur-md dark:border-slate-700 dark:from-slate-900/90 dark:to-slate-950/90">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[#0B2A5B] dark:text-slate-50">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </Card>
  );
}

export interface ExecutiveDashboardPanelProps {
  dateFrom: string;
  dateTo: string;
  branchId: string;
}

const ExecutiveDashboardPanel: React.FC<ExecutiveDashboardPanelProps> = ({ dateFrom, dateTo, branchId }) => {
  const [data, setData] = useState<ExecutiveSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsApi.executiveSummary({
          from: dateFrom,
          to: dateTo,
          branchId: branchId || null,
        });
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load executive summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, branchId]);

  const pieExpense = useMemo(() => {
    if (!data) return [];
    const e = Math.max(0, data.kpis.expenses);
    const rest = Math.max(0, data.kpis.netSales - e);
    return [
      { name: 'Operating expenses', value: e },
      { name: 'Net sales (after discount)', value: rest },
    ];
  }, [data]);

  const heatmap = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({
      h,
      v: Math.round(40 + Math.sin(h / 3) * 35 + (h % 7) * 8),
    }));
    return hours;
  }, []);

  if (loading) {
    return (
      <div className="grid animate-pulse gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200/80 dark:bg-slate-800/80" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border border-red-200 bg-red-50/90 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-semibold">Could not load executive dashboard</p>
        <p className="mt-1 text-sm">{error}</p>
      </Card>
    );
  }

  const { kpis, series } = data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-100">Executive dashboard</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Consolidated KPIs with live aggregates from POS, expenses, and optional materialized views (PostgreSQL).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <Kpi label="Total sales" value={kpis.totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
        <Kpi label="Net sales" value={kpis.netSales.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
        <Kpi label="Net profit (est.)" value={kpis.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
        <Kpi
          label="Gross margin"
          value={`${kpis.grossMarginPct.toFixed(1)}%`}
          hint="Approximation from net sales vs expenses in-range"
        />
        <Kpi label="Discounts" value={kpis.discounts.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
        <Kpi label="Taxes" value={kpis.taxes.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
        <Kpi label="Expenses" value={kpis.expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
        <Kpi label="Average order value" value={kpis.averageOrderValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
        <Kpi label="Orders" value={String(kpis.orders)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card padding="lg" className="border border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/60">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Revenue trend</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series.revenueTrend}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0047AB" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0047AB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#0047AB" fill="url(#revFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="lg" className="border border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/60">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Profit proxy trend</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Net sales minus same-window expense ratio (illustrative).</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={series.revenueTrend.map((d) => ({
                  day: d.day,
                  profit: Math.max(0, d.revenue - (kpis.expenses / Math.max(series.revenueTrend.length, 1))),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="profit" stroke="#059669" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="lg" className="border border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/60">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Hourly intensity (sample)</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Replace with transactional hourly buckets from analytics warehouse.</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={heatmap}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="h" tickFormatter={(v) => `${v}h`} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="v" name="Intensity" radius={[4, 4, 0, 0]}>
                  {heatmap.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="lg" className="border border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/60">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Branch comparison</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series.topBranches} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0047AB" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="lg" className="border border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/60">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Expense mix</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieExpense} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieExpense.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="lg" className="border border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/60">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Top products</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series.topProducts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-18} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ExecutiveDashboardPanel;
