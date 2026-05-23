import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';

const CHART_BLUE = '#4A90E2';
const DONUT_COLORS = ['#4A90E2', '#50C878', '#F6C23E', '#E74A3B', '#9B59B6', '#17A2B8', '#6C757D'];

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--card-foreground)',
} as const;

export type DashboardChartsProps = {
  chartsLoaded: boolean;
  cachedAt: string | null;
  salesTrend: { label: string; revenue: number }[];
  revenueBreakdown: { name: string; value: number }[];
};

export default function DashboardCharts({
  chartsLoaded,
  cachedAt,
  salesTrend,
  revenueBreakdown,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="border border-gray-100 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none" padding="none">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">Daily Sales Trends</h2>
          <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">Last 7 days (POS + mobile)</p>
        </div>
        <div className="p-4 pt-2">
          {!chartsLoaded || salesTrend.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              {!chartsLoaded ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              ) : cachedAt ? (
                'Charts need an online connection.'
              ) : (
                'No trend data yet.'
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_BLUE} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                />
                <Tooltip
                  formatter={(v: number) => [`${CURRENCY} ${v.toLocaleString()}`, 'Revenue']}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: 'var(--muted-foreground)' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_BLUE}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#dashAreaFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="border border-gray-100 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none" padding="none">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">Revenue Breakdown</h2>
          <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">By product category</p>
        </div>
        <div className="p-4 pt-2">
          {!chartsLoaded || revenueBreakdown.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              {!chartsLoaded ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              ) : cachedAt ? (
                'Charts need an online connection.'
              ) : (
                'No category data yet.'
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={revenueBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) =>
                    `${String(name).slice(0, 10)}${String(name).length > 10 ? '…' : ''} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {revenueBreakdown.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [`${CURRENCY} ${v.toLocaleString()}`, 'Revenue']}
                  contentStyle={tooltipStyle}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}
