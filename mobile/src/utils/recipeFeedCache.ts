const TTL_MS = 120_000;
const mem = new Map<string, { t: number; v: unknown }>();

export function recipeFeedCacheGet<T>(key: string): T | null {
    const e = mem.get(key);
    if (!e || Date.now() - e.t > TTL_MS) return null;
    return e.v as T;
}

export function recipeFeedCacheSet(key: string, v: unknown) {
    mem.set(key, { t: Date.now(), v });
}

export function recipeFeedCacheInvalidatePrefix(prefix: string) {
    for (const k of mem.keys()) {
        if (k.startsWith(prefix)) mem.delete(k);
    }
}
