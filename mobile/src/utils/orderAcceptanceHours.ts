/**
 * Branch order windows from POS → Mobile ordering settings (Orders from / Orders until).
 * Same-day window: [start, end] inclusive on minute resolution.
 * Overnight window: start > end means open from start through midnight and until end.
 */

export function parseTimeToMinutes(s: string | undefined | null): number | null {
    if (s == null || typeof s !== 'string') return null;
    const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
    return h * 60 + min;
}

/** True when the shop is not accepting orders at `at` (local device time). */
export function isOrderAcceptanceClosedAt(
    orderAcceptanceStart: string,
    orderAcceptanceEnd: string,
    at: Date = new Date()
): boolean {
    const start = parseTimeToMinutes(orderAcceptanceStart);
    const end = parseTimeToMinutes(orderAcceptanceEnd);
    if (start === null || end === null) return false;

    const nowMin = at.getHours() * 60 + at.getMinutes();

    if (start <= end) {
        const open = nowMin >= start && nowMin <= end;
        return !open;
    }

    const open = nowMin >= start || nowMin <= end;
    return !open;
}

export function formatMinutesLocal(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatOrderAcceptanceRange(startRaw: string, endRaw: string): string {
    const s = parseTimeToMinutes(startRaw);
    const e = parseTimeToMinutes(endRaw);
    if (s === null || e === null) return '';
    return `${formatMinutesLocal(s)} – ${formatMinutesLocal(e)}`;
}
