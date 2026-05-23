import { getDatabaseService } from '../services/databaseService.js';

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

export function zonedDateTimeToUtc(ymd: string, time: string, timeZone: string): Date {
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

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
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

const tenantTzCache = new Map<string, { tz: string; expires: number }>();
const CACHE_MS = 60_000;

export async function resolveTenantTimezone(tenantId: string): Promise<string> {
  const hit = tenantTzCache.get(tenantId);
  if (hit && hit.expires > Date.now()) return hit.tz;

  const db = getDatabaseService();
  const rows = await db.query<{ timezone?: string }>(
    `SELECT timezone FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const tz = normalizeShopTimezone(rows[0]?.timezone);
  tenantTzCache.set(tenantId, { tz, expires: Date.now() + CACHE_MS });
  return tz;
}

export function invalidateTenantTimezoneCache(tenantId: string): void {
  tenantTzCache.delete(tenantId);
}

export async function calendarDayBoundsForTenant(
  tenantId: string,
  dateYmd: string
): Promise<{ start: string; end: string }> {
  const tz = await resolveTenantTimezone(tenantId);
  return calendarDayBoundsIso(tz, dateYmd);
}

export async function tenantTodayYmd(tenantId: string): Promise<string> {
  const tz = await resolveTenantTimezone(tenantId);
  return todayYmdInTimezone(tz);
}
