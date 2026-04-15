/** Normalize to digits-only PK mobile suitable for server matching (same digit rules as rider auth). */
export function normalizePakistanPhone(input: string): string | null {
  const d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('92') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 11) return `92${d.slice(1)}`;
  if (d.length === 10 && /^3\d{9}$/.test(d)) return `92${d}`;
  return null;
}

export function isValidPkPhoneDisplay(input: string): boolean {
  return normalizePakistanPhone(input) != null;
}
