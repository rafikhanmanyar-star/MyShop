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

/** UTC ISO bounds for one calendar day in the given IANA timezone. */
export function calendarDayBoundsIso(
  timeZone: string,
  dateYmd: string
): { start: string; end: string } {
  const tz = normalizeShopTimezone(timeZone);
  const start = zonedDateTimeToUtc(dateYmd, '00:00:00', tz);
  const nextYmd = addDaysYmd(dateYmd, 1);
  const end = zonedDateTimeToUtc(nextYmd, '00:00:00', tz);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Inclusive last-N-day window in shop timezone (oldest first). */
export function lastNDayRangeIso(
  count: number,
  timeZone: string
): { fromIso: string; toIso: string; dayKeys: string[]; categoryToIso: string } {
  const dayKeys = lastYmdDaysInTimezone(count, timeZone);
  const fromIso = calendarDayBoundsIso(timeZone, dayKeys[0]).start;
  const toIso = calendarDayBoundsIso(timeZone, dayKeys[dayKeys.length - 1]).end;
  const categoryToIso = calendarDayBoundsIso(timeZone, addDaysYmd(dayKeys[dayKeys.length - 1], 1)).start;
  return { fromIso, toIso, dayKeys, categoryToIso };
}

/** Last N calendar months in shop timezone (oldest first), including the current month. */
export function lastNMonthKeys(count: number, timeZone: string): string[] {
  const n = Math.max(1, Math.floor(count));
  const tz = normalizeShopTimezone(timeZone);
  const today = todayYmdInTimezone(tz);
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let month = m - i;
    let year = y;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    out.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return out;
}

/** UTC bounds for the last N calendar months through end of the current month. */
export function lastNMonthRangeIso(
  count: number,
  timeZone: string
): { fromIso: string; toIso: string; monthKeys: string[]; categoryToIso: string } {
  const monthKeys = lastNMonthKeys(count, timeZone);
  const fromIso = calendarDayBoundsIso(timeZone, `${monthKeys[0]}-01`).start;
  const [ly, lm] = monthKeys[monthKeys.length - 1].split('-').map(Number);
  let nextMonth = lm + 1;
  let nextYear = ly;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const toIso = calendarDayBoundsIso(timeZone, `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`).start;
  return { fromIso, toIso, monthKeys, categoryToIso: toIso };
}
