import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';

const CHART_BLUE = '#4A90E2';

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--card-foreground)',
} as const;

export type HourlyTrendPoint = { hour: number; label: string; revenue: number; orders: number };

export type DailyHourlyTrendChartProps = {
  loading: boolean;
  data: HourlyTrendPoint[];
  dateLabel: string;
};

export default function DailyHourlyTrendChart({ loading, data, dateLabel }: DailyHourlyTrendChartProps) {
  const hasData = data.some((d) => d.revenue > 0 || d.orders > 0);

  return (
    <Card
      className="border border-gray-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none"
      padding="none"
    >
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
        <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">Hourly sales trend</h2>
        <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">
          POS + mobile revenue by hour · {dateLabel}
        </p>
      </div>
      <div className="p-4 pt-2">
        {loading ? (
          <div className="flex h-[220px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : !hasData ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            No sales recorded for this day yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              />
              <Tooltip
                formatter={(v: number, name: string) => {
                  if (name === 'revenue') return [`${CURRENCY} ${v.toLocaleString()}`, 'Revenue'];
                  return [v.toLocaleString(), 'Orders'];
                }}
                contentStyle={tooltipStyle}
                labelStyle={{ color: 'var(--muted-foreground)' }}
              />
              <Bar dataKey="revenue" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
