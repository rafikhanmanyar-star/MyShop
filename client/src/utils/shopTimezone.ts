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

/** Day of week (0=Sunday..6=Saturday) for a YYYY-MM-DD date string. */
function weekdayOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Inclusive day range from startYmd through today (shop timezone), oldest first. */
function rangeFromStartYmd(
  startYmd: string,
  timeZone: string
): { fromIso: string; toIso: string; dayKeys: string[]; categoryToIso: string } {
  const tz = normalizeShopTimezone(timeZone);
  const today = todayYmdInTimezone(tz);
  const dayKeys: string[] = [];
  let cur = startYmd > today ? today : startYmd;
  while (cur <= today) {
    dayKeys.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  const fromIso = calendarDayBoundsIso(tz, dayKeys[0]).start;
  const lastKey = dayKeys[dayKeys.length - 1];
  const toIso = calendarDayBoundsIso(tz, lastKey).end;
  const categoryToIso = calendarDayBoundsIso(tz, addDaysYmd(lastKey, 1)).start;
  return { fromIso, toIso, dayKeys, categoryToIso };
}

/** Week-to-date window in shop timezone (from the start of the current week through today). */
export function weekToDateRangeIso(
  timeZone: string,
  weekStartsOn: 0 | 1 = 1
): { fromIso: string; toIso: string; dayKeys: string[]; categoryToIso: string } {
  const tz = normalizeShopTimezone(timeZone);
  const today = todayYmdInTimezone(tz);
  const diff = (weekdayOfYmd(today) - weekStartsOn + 7) % 7;
  return rangeFromStartYmd(addDaysYmd(today, -diff), tz);
}

/** Month-to-date window in shop timezone (from the 1st of the current month through today). */
export function monthToDateRangeIso(
  timeZone: string
): { fromIso: string; toIso: string; dayKeys: string[]; categoryToIso: string } {
  const tz = normalizeShopTimezone(timeZone);
  const today = todayYmdInTimezone(tz);
  return rangeFromStartYmd(`${today.slice(0, 7)}-01`, tz);
}

/** Year-to-date window in shop timezone (from Jan 1 of the current year through today). */
export function yearToDateRangeIso(
  timeZone: string
): { fromIso: string; toIso: string; dayKeys: string[]; categoryToIso: string } {
  const tz = normalizeShopTimezone(timeZone);
  const today = todayYmdInTimezone(tz);
  return rangeFromStartYmd(`${today.slice(0, 4)}-01-01`, tz);
}

/** Year-to-date month buckets in shop timezone (Jan through the current month). */
export function yearToDateMonthRangeIso(
  timeZone: string
): { fromIso: string; toIso: string; monthKeys: string[]; categoryToIso: string } {
  const tz = normalizeShopTimezone(timeZone);
  const today = todayYmdInTimezone(tz);
  const [y, m] = today.split('-').map(Number);
  const monthKeys: string[] = [];
  for (let mo = 1; mo <= m; mo++) {
    monthKeys.push(`${y}-${String(mo).padStart(2, '0')}`);
  }
  const fromIso = calendarDayBoundsIso(tz, `${monthKeys[0]}-01`).start;
  let nextMonth = m + 1;
  let nextYear = y;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const toIso = calendarDayBoundsIso(tz, `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`).start;
  return { fromIso, toIso, monthKeys, categoryToIso: toIso };
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
