/**
 * Geo-distance utilities — Haversine formula, km/mi support.
 * Shared by delivery validation and ETA display.
 */

import type { DistanceUnit, GeoCoordinates } from './types';

const EARTH_RADIUS_KM = 6371;
const KM_TO_MI = 0.621371;

/** Great-circle distance in kilometers (WGS84). */
export function haversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
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

export function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return haversineDistanceKm(lat1, lon1, lat2, lon2) * KM_TO_MI;
}

export function distanceBetween(a: GeoCoordinates, b: GeoCoordinates, unit: DistanceUnit = 'km'): number {
    const km = haversineDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
    return unit === 'mi' ? km * KM_TO_MI : km;
}

export function formatDistance(km: number, unit: DistanceUnit = 'km'): string {
    const value = unit === 'mi' ? km * KM_TO_MI : km;
    const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    return unit === 'mi' ? `${rounded} mi` : `${rounded} km`;
}
