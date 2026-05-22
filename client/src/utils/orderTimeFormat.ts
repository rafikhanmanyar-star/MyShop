import { normalizeShopTimezone } from './shopTimezone';

/** Parse API instant (ISO UTC) to epoch ms. */
export function parseApiInstant(iso: string): number {
  const s = (iso || '').trim();
  if (!s) return 0;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - parseApiInstant(iso);
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function formatOrderTime(iso: string, timeZone?: string): string {
  const tz = normalizeShopTimezone(timeZone);
  const ms = parseApiInstant(iso);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-PK', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
    hour12: true,
  });
}
