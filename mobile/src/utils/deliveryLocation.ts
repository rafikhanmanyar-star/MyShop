/**
 * Customer delivery location helpers (Stage 1 — capture lat/lng for orders).
 */

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km (WGS84), same formula as the server. */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const r1 = (lat1 * Math.PI) / 180;
    const r2 = (lat2 * Math.PI) / 180;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(r1) * Math.cos(r2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
}

/** Urban delivery bike speed band (km/h) for ETA range display. */
const BIKE_SPEED_FAST_KMH = 30;
const BIKE_SPEED_SLOW_KMH = 20;
/** Order processing, packing, and handoff (minutes) added to travel time. */
const ORDER_PREP_MINUTES = 15;

/**
 * Estimated delivery window: travel time at 30–20 km/h plus fixed prep, in whole minutes.
 * Returns [min, max] inclusive; equal when distance is 0 (prep only).
 */
export function estimatedDeliveryRangeMinutes(distanceKm: number): { min: number; max: number } {
    const d = Math.max(0, Number(distanceKm) || 0);
    if (d <= 0) {
        return { min: ORDER_PREP_MINUTES, max: ORDER_PREP_MINUTES };
    }
    const travelMin = (d / BIKE_SPEED_FAST_KMH) * 60;
    const travelMax = (d / BIKE_SPEED_SLOW_KMH) * 60;
    const lo = Math.ceil(travelMin + ORDER_PREP_MINUTES);
    const hi = Math.ceil(travelMax + ORDER_PREP_MINUTES);
    return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}

export interface GeoPosition {
    latitude: number;
    longitude: number;
}

export function getCurrentGeoPosition(options?: PositionOptions): Promise<GeoPosition> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new Error('Location is not supported on this device'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                });
            },
            (err) => {
                const msg =
                    err.code === 1
                        ? 'Location permission denied. Enable it in browser settings or enter your address manually.'
                        : err.code === 2
                          ? 'Could not determine your location. Try again or enter your address manually.'
                          : err.code === 3
                            ? 'Location request timed out. Try again.'
                            : err.message || 'Could not get your location';
                reject(new Error(msg));
            },
            {
                enableHighAccuracy: true,
                timeout: 20_000,
                maximumAge: 60_000,
                ...options,
            }
        );
    });
}

/**
 * Free reverse geocoding (OpenStreetMap Nominatim). Best-effort; may fail from some networks.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export async function reverseGeocodeApprox(lat: number, lng: number): Promise<string | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=18&addressdetails=1`;
        const res = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'Accept-Language': 'en',
            },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { display_name?: string };
        const name = data.display_name?.trim();
        return name || null;
    } catch {
        return null;
    }
}
