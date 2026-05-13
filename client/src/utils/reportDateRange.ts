import type { DatePreset } from '../types/reports';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function computePresetRange(preset: DatePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  const ymd = formatYmd(today);
  if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
  if (preset === 'today') return { from: ymd, to: ymd };
  if (preset === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const d = formatYmd(y);
    return { from: d, to: d };
  }
  if (preset === 'this_week') {
    const start = startOfWeekMonday(today);
    return { from: formatYmd(start), to: ymd };
  }
  if (preset === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatYmd(start), to: ymd };
  }
  return { from: ymd, to: ymd };
}
