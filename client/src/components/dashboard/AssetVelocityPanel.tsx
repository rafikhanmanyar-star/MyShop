import React from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingDown, TrendingUp, Wallet, Package } from 'lucide-react';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';

export type AssetVelocityData = {
  points: { label: string; costValue: number; retailValue: number }[];
  costNow: number;
  retailNow: number;
  costStart: number;
  retailStart: number;
} | null;

function pctChange(start: number, now: number): number | undefined {
  if (!start || start === 0) return undefined;
  return ((now - start) / start) * 100;
}

function money(n: number) {
  return `${CURRENCY} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--card-foreground)',
  fontSize: '12px',
} as const;

function Delta({ value }: { value?: number }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className={`mt-0.5 flex items-center gap-0.5 text-[0.65rem] font-semibold ${up ? 'text-emerald-500' : 'text-rose-500'}`}>
      {up ? <TrendingUp className="h-3 w-3" strokeWidth={2.5} /> : <TrendingDown className="h-3 w-3" strokeWidth={2.5} />}
      {up ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}

export default function AssetVelocityPanel({
  data,
  loading,
}: {
  data: AssetVelocityData;
  loading: boolean;
}) {
  const ready = data != null;
  const points = data?.points ?? [];

  return (
    <Card
      className="border border-gray-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:shadow-none"
      padding="none"
    >
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
        <h2 className="text-[0.7rem] font-bold uppercase tracking-wider text-[#6C757D] dark:text-muted-foreground">
          Asset velocity
        </h2>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/12 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400">
            <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold uppercase tracking-wider text-[#6C757D] dark:text-muted-foreground">
              Purchase value
            </p>
            <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-[#212529] dark:text-foreground">
              {loading || !ready ? '—' : money(data!.costNow)}
            </p>
            {ready && <Delta value={pctChange(data!.costStart, data!.costNow)} />}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
            <Package className="h-4 w-4" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold uppercase tracking-wider text-[#6C757D] dark:text-muted-foreground">
              Selling value
            </p>
            <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-[#212529] dark:text-foreground">
              {loading || !ready ? '—' : money(data!.retailNow)}
            </p>
            {ready && <Delta value={pctChange(data!.retailStart, data!.retailNow)} />}
          </div>
        </div>

        <div className="h-[72px] w-full">
          {ready && points.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="av-cost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4A90E2" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#4A90E2" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="av-retail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#50C878" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#50C878" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [
                    money(Number(v) || 0),
                    name === 'retailValue' ? 'Selling' : 'Purchase',
                  ]}
                />
                <Area type="monotone" dataKey="retailValue" stroke="#50C878" strokeWidth={1.5} fill="url(#av-retail)" />
                <Area type="monotone" dataKey="costValue" stroke="#4A90E2" strokeWidth={1.5} fill="url(#av-cost)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-[0.7rem] text-muted-foreground">
              {loading ? 'Loading…' : 'No trend data'}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
