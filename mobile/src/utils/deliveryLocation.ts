/**
 * Customer delivery location helpers (Stage 1 — capture lat/lng for orders).
 */

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
