/**
 * Customer delivery location helpers (Stage 1 — capture lat/lng for orders).
 * Permission-aware GPS via permissions/locationPermission on native Android.
 */

import { getCurrentLocationWithPermission } from '../permissions/locationPermission';
export {
    haversineDistanceKm,
    formatDistance,
    distanceBetween,
} from '../permissions/geoDistance';
export { validateCustomerAgainstBranch, validateDeliveryRange } from '../permissions/deliveryRangeValidator';

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

/** Gets GPS coordinates with runtime permission handling (Capacitor + web). */
export function getCurrentGeoPosition(options?: {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
}): Promise<GeoPosition> {
    return getCurrentLocationWithPermission(options);
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
