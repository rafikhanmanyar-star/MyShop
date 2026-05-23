import { describe, expect, it } from 'vitest';
import {
  calendarDayBoundsIso,
  normalizeShopTimezone,
  todayYmdInTimezone,
  zonedDateTimeToUtc,
} from './shopTimezone.js';

describe('shopTimezone', () => {
  it('maps legacy GMT+5 to Asia/Karachi', () => {
    expect(normalizeShopTimezone('GMT+5')).toBe('Asia/Karachi');
  });

  it('rejects invalid zones', () => {
    expect(normalizeShopTimezone('Not/AZone')).toBe('Asia/Karachi');
  });

  it('calendar day bounds span 24h in UTC', () => {
    const { start, end } = calendarDayBoundsIso('UTC', '2024-06-15');
    expect(start).toBe('2024-06-15T00:00:00.000Z');
    expect(end).toBe('2024-06-16T00:00:00.000Z');
  });

  it('Asia/Karachi midnight maps to previous UTC evening', () => {
    const d = zonedDateTimeToUtc('2024-06-15', '00:00:00', 'Asia/Karachi');
    expect(d.toISOString()).toBe('2024-06-14T19:00:00.000Z');
  });

  it('todayYmdInTimezone returns YYYY-MM-DD', () => {
    const ymd = todayYmdInTimezone('UTC');
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
