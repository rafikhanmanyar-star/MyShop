/**
 * Location permission — delivery range, address capture, ETA.
 * Native Android: @capacitor/geolocation with runtime permission API.
 * Web/PWA: navigator.geolocation with permission-aware errors.
 */

import { Geolocation } from '@capacitor/geolocation';
import { isNativeAndroid } from '../services/firebaseNative';
import { PERMISSION_COPY } from './constants';
import {
    incrementPermissionRequestCount,
    permissionDevLog,
    resolvePermissionStatus,
} from './permissionService';
import type { GeoCoordinates, PermissionCheckResult, PermissionRequestResult } from './types';

type CapPermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

function mapCapLocationState(state: CapPermissionState | undefined): boolean {
    return state === 'granted';
}

function mapCapCanPrompt(state: CapPermissionState | undefined): boolean {
    return state === 'prompt' || state === 'prompt-with-rationale';
}

async function checkNativeLocationPermission(): Promise<{ granted: boolean; canPrompt: boolean }> {
    const result = await Geolocation.checkPermissions();
    const loc = result.location as CapPermissionState | undefined;
    const coarse = result.coarseLocation as CapPermissionState | undefined;
    const granted = mapCapLocationState(loc) || mapCapLocationState(coarse);
    const canPrompt = mapCapCanPrompt(loc) || mapCapCanPrompt(coarse);
    return { granted, canPrompt };
}

async function requestNativeLocationPermission(): Promise<boolean> {
    const result = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    const loc = result.location as CapPermissionState | undefined;
    const coarse = result.coarseLocation as CapPermissionState | undefined;
    return mapCapLocationState(loc) || mapCapLocationState(coarse);
}

async function checkWebLocationPermission(): Promise<{ granted: boolean; canPrompt: boolean }> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return { granted: false, canPrompt: false };
    }
    try {
        const perm = navigator.permissions as Permissions | undefined;
        if (perm?.query) {
            const status = await perm.query({ name: 'geolocation' });
            return {
                granted: status.state === 'granted',
                canPrompt: status.state === 'prompt',
            };
        }
    } catch {
        /* ignore */
    }
    return { granted: false, canPrompt: true };
}

export async function checkLocationPermission(): Promise<PermissionCheckResult> {
    permissionDevLog('checkLocation');

    if (isNativeAndroid()) {
        try {
            const { granted, canPrompt } = await checkNativeLocationPermission();
            const status = resolvePermissionStatus('location', granted, canPrompt);
            return {
                status,
                message: granted ? undefined : PERMISSION_COPY.location.denied,
            };
        } catch (err) {
            permissionDevLog('native location check failed', err);
        }
    } else {
        const { granted, canPrompt } = await checkWebLocationPermission();
        const status = resolvePermissionStatus('location', granted, canPrompt);
        return {
            status,
            message: granted ? undefined : PERMISSION_COPY.location.denied,
        };
    }

    return {
        status: 'unavailable',
        message: 'Location is not supported on this device.',
    };
}

export async function requestLocationPermission(): Promise<PermissionRequestResult> {
    permissionDevLog('requestLocation');
    incrementPermissionRequestCount('location');

    let granted = false;
    let canPrompt = true;

    if (isNativeAndroid()) {
        try {
            granted = await requestNativeLocationPermission();
            if (!granted) {
                const check = await checkNativeLocationPermission();
                canPrompt = check.canPrompt;
            }
        } catch (err) {
            permissionDevLog('native location request failed', err);
        }
    } else {
        const web = await checkWebLocationPermission();
        if (!web.granted) {
            // Browser prompts on first getCurrentPosition — probe below
            canPrompt = web.canPrompt;
        } else {
            granted = true;
        }
    }

    const status = resolvePermissionStatus('location', granted, canPrompt);
    const canAskAgain = status !== 'permanently_denied' && status !== 'granted';

    return {
        status,
        canAskAgain,
        message:
            status === 'granted'
                ? undefined
                : status === 'permanently_denied'
                  ? PERMISSION_COPY.location.permanent
                  : PERMISSION_COPY.location.denied,
    };
}

export async function ensureLocationPermission(): Promise<PermissionRequestResult> {
    const current = await checkLocationPermission();
    if (current.status === 'granted') {
        return { ...current, canAskAgain: false };
    }
    if (current.status === 'permanently_denied') {
        return {
            ...current,
            canAskAgain: false,
            message: PERMISSION_COPY.location.permanent,
        };
    }
    return requestLocationPermission();
}

export interface GetLocationOptions {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
}

/**
 * Gets current coordinates after verifying permission.
 * Throws user-friendly Error on denial, timeout, or GPS disabled.
 */
export async function getCurrentLocationWithPermission(
    options?: GetLocationOptions
): Promise<GeoCoordinates> {
    const perm = await ensureLocationPermission();
    if (perm.status !== 'granted' && perm.status !== 'prompt') {
        // On web, first getCurrentPosition may still prompt even if status is prompt
        if (perm.status === 'denied' || perm.status === 'permanently_denied') {
            throw new Error(perm.message ?? PERMISSION_COPY.location.denied);
        }
    }

    const timeout = options?.timeout ?? 20_000;
    const enableHighAccuracy = options?.enableHighAccuracy ?? true;
    const maximumAge = options?.maximumAge ?? 60_000;

    if (isNativeAndroid()) {
        try {
            const pos = await Geolocation.getCurrentPosition({
                enableHighAccuracy,
                timeout,
                maximumAge,
            });
            return {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/disabled|provider|location services/i.test(msg)) {
                throw new Error(PERMISSION_COPY.location.gpsDisabled);
            }
            if (/denied|permission/i.test(msg)) {
                throw new Error(PERMISSION_COPY.location.denied);
            }
            throw new Error(msg || 'Could not determine your location');
        }
    }

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
                const locationServicesDisabled = err.code === 2;
                const msg =
                    err.code === 1
                        ? PERMISSION_COPY.location.denied
                        : err.code === 2
                          ? PERMISSION_COPY.location.gpsDisabled
                          : err.code === 3
                            ? 'Location request timed out. Try again.'
                            : err.message || 'Could not get your location';
                const error = new Error(msg);
                (error as Error & { locationServicesDisabled?: boolean }).locationServicesDisabled =
                    locationServicesDisabled;
                reject(error);
            },
            {
                enableHighAccuracy,
                timeout,
                maximumAge,
                ...options,
            }
        );
    });
}

export function isLocationGranted(result: PermissionCheckResult | PermissionRequestResult): boolean {
    return result.status === 'granted';
}
