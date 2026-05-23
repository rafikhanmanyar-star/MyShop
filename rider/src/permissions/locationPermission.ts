/**
 * Rider PWA — foreground location permission helpers (browser geolocation).
 * No Capacitor shell; uses Permissions API + watchPosition error codes.
 */

export type RiderLocationPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

export async function checkRiderLocationPermission(): Promise<RiderLocationPermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return 'unavailable';
    }
    try {
        const perm = navigator.permissions as Permissions | undefined;
        if (perm?.query) {
            const status = await perm.query({ name: 'geolocation' });
            if (status.state === 'granted') return 'granted';
            if (status.state === 'denied') return 'denied';
            return 'prompt';
        }
    } catch {
        /* ignore */
    }
    return 'prompt';
}

export function mapGeolocationError(err: GeolocationPositionError): { message: string; gpsDisabled: boolean } {
    if (err.code === 1) {
        return {
            message: 'Location permission denied. Enable it in browser settings to go online.',
            gpsDisabled: false,
        };
    }
    if (err.code === 2) {
        return {
            message: 'Location unavailable. Enable GPS and try again.',
            gpsDisabled: true,
        };
    }
    if (err.code === 3) {
        return { message: 'Location request timed out. Retrying…', gpsDisabled: false };
    }
    return { message: err.message || 'Could not read location.', gpsDisabled: false };
}

/** Probe once to trigger browser permission prompt when needed. */
export function probeRiderLocation(timeoutMs = 15_000): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new Error('Location is not supported on this device.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            (err) => reject(new Error(mapGeolocationError(err).message)),
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 }
        );
    });
}
