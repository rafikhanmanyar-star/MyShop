import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';

const COST_COLOR = '#4A90E2';
const RETAIL_COLOR = '#50C878';

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--card-foreground)',
} as const;

export type InventoryValuePoint = { label: string; costValue: number; retailValue: number };

export type InventoryValueChartProps = {
  chartsLoaded: boolean;
  cachedAt: string | null;
  data: InventoryValuePoint[];
  title?: string;
  subtitle?: string;
  tickInterval?: number;
  height?: number;
};

export default function InventoryValueChart({
  chartsLoaded,
  cachedAt,
  data,
  title = 'Inventory Value Trend',
  subtitle = 'Total purchase (cost) vs. selling (retail) value',
  tickInterval = 0,
  height = 260,
}: InventoryValueChartProps) {
  return (
    <Card
      className="border border-gray-100 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none"
      padding="none"
    >
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
        <h2 className="text-base font-semibold text-[#212529] dark:text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-[#6C757D] dark:text-muted-foreground">{subtitle}</p>
      </div>
      <div className="p-4 pt-2">
        {!chartsLoaded || data.length === 0 ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
          >
            {!chartsLoaded ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            ) : cachedAt ? (
              'Charts need an online connection.'
            ) : (
              'No inventory data yet.'
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="invCostFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COST_COLOR} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COST_COLOR} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="invRetailFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={RETAIL_COLOR} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={RETAIL_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval > 0 ? tickInterval : undefined}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              />
              <Tooltip
                formatter={(v: number, name) => [
                  `${CURRENCY} ${v.toLocaleString()}`,
                  name === 'costValue' ? 'Purchase value' : 'Selling value',
                ]}
                contentStyle={tooltipStyle}
                labelStyle={{ color: 'var(--muted-foreground)' }}
              />
              <Legend
                verticalAlign="top"
                height={28}
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value) => (
                  <span className="text-muted-foreground">
                    {value === 'costValue' ? 'Purchase value' : 'Selling value'}
                  </span>
                )}
              />
              <Area
                type="monotone"
                dataKey="costValue"
                stroke={COST_COLOR}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#invCostFill)"
              />
              <Area
                type="monotone"
                dataKey="retailValue"
                stroke={RETAIL_COLOR}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#invRetailFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
