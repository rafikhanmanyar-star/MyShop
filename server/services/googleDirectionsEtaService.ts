/**
 * Server-side driving ETA via Google Directions API (customer track screen).
 * Caches by rounded coordinates to limit billable requests.
 */

const cache = new Map<string, { expiry: number; durationSeconds: number }>();
const TTL_MS = 45_000;

function round4(n: number): number {
    return Math.round(n * 10000) / 10000;
}

function cacheKey(oLat: number, oLng: number, dLat: number, dLng: number): string {
    return `${round4(oLat)},${round4(oLng)}|${round4(dLat)},${round4(dLng)}`;
}

export async function getDrivingDurationSeconds(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
): Promise<number | null> {
    const key = cacheKey(originLat, originLng, destLat, destLng);
    const hit = cache.get(key);
    if (hit && Date.now() < hit.expiry) {
        return hit.durationSeconds;
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_KEY;
    if (!apiKey) {
        return null;
    }

    const origin = `${originLat},${originLng}`;
    const dest = `${destLat},${destLng}`;
    const url =
        `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}` +
        `&destination=${encodeURIComponent(dest)}&mode=driving&key=${encodeURIComponent(apiKey)}`;

    try {
        const res = await fetch(url);
        const data = (await res.json()) as {
            status: string;
            routes?: { legs: { duration: { value: number } }[] }[];
        };
        if (data.status !== 'OK' || !data.routes?.length) {
            return null;
        }
        const leg = data.routes[0].legs?.[0];
        const sec = leg?.duration?.value;
        if (typeof sec !== 'number' || !Number.isFinite(sec)) return null;
        cache.set(key, { expiry: Date.now() + TTL_MS, durationSeconds: sec });
        return sec;
    } catch {
        return null;
    }
}
