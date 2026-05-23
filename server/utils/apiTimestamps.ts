/**
 * Serialize DB timestamps for API clients.
 * TIMESTAMP WITHOUT TIME ZONE columns store UTC wall-clock; node-pg may attach the
 * process local zone when building Date objects — we re-encode wall-clock digits as UTC.
 */
export function toApiInstant(value: unknown): string {
  if (value == null || value === '') {
    return new Date(0).toISOString();
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return new Date(0).toISOString();
    return new Date(
      Date.UTC(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds()
      )
    ).toISOString();
  }

  const s = String(value).trim();
  if (!s) return new Date(0).toISOString();

  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
  }

  const norm = s.includes('T') ? s : s.replace(' ', 'T');
  const base = norm.replace(/\.\d+$/, '');
  const d = new Date(`${base}Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
}
