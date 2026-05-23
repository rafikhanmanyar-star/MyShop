export const DEFAULT_SHOP_TIMEZONE = 'Asia/Karachi';

const LEGACY_TZ_MAP: Record<string, string> = {
  'GMT+5': 'Asia/Karachi',
  'GMT+5:00': 'Asia/Karachi',
  'GMT+5:30': 'Asia/Kolkata',
  UTC: 'UTC',
};

export function isValidIanaTimezone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

export function normalizeShopTimezone(raw: string | null | undefined): string {
  const t = (raw || '').trim();
  if (!t) return DEFAULT_SHOP_TIMEZONE;
  const mapped = LEGACY_TZ_MAP[t] || t;
  return isValidIanaTimezone(mapped) ? mapped : DEFAULT_SHOP_TIMEZONE;
}

export function todayYmdInTimezone(timeZone: string): string {
  const tz = normalizeShopTimezone(timeZone);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const zoned = new Date(date.toLocaleString('en-US', { timeZone }));
  return zoned.getTime() - utc.getTime();
}

function zonedDateTimeToUtc(ymd: string, time: string, timeZone: string): Date {
  const tz = normalizeShopTimezone(timeZone);
  const [year, month, day] = ymd.split('-').map(Number);
  const parts = time.split(':').map(Number);
  const hour = parts[0] ?? 0;
  const minute = parts[1] ?? 0;
  const second = parts[2] ?? 0;
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimezoneOffsetMs(new Date(guessUtc), tz);
  return new Date(guessUtc - offset);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Last N calendar days in shop timezone (oldest first), including today. */
export function lastYmdDaysInTimezone(count: number, timeZone: string): string[] {
  const n = Math.max(1, Math.floor(count));
  const tz = normalizeShopTimezone(timeZone);
  const today = todayYmdInTimezone(tz);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(addDaysYmd(today, -i));
  }
  return out;
}
