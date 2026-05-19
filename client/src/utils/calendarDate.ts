/** Today's calendar date in the browser's local timezone (YYYY-MM-DD), for date inputs and daily reports. */
export function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Last N calendar days in local timezone (oldest first), including today. */
export function lastLocalYmdDays(count: number): string[] {
  const n = Math.max(1, Math.floor(count));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}
