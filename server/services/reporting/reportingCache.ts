type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 30_000;

export function getReportingCache<T>(key: string): T | undefined {
  const row = store.get(key);
  if (!row) return undefined;
  if (Date.now() > row.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return row.value as T;
}

export function setReportingCache<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function reportingCacheKey(parts: (string | number | null | undefined)[]): string {
  return parts.map((p) => (p === undefined || p === null ? '∅' : String(p))).join('|');
}
