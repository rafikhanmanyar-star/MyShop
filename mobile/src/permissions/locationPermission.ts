/**
 * Location permission — delivery range, address capture, ETA.
 * Native Android: @capacitor/geolocation (OS state is source of truth).
 * Web/PWA: navigator.geolocation with permission-aware errors.
 */

import { Geolocation } from '@capacitor/geolocation';
import { isNativeAndroid } from '../services/firebaseNative';
import { PERMISSION_COPY } from './constants';
import {
    incrementPermissionRequestCount,
    permissionDevLog,
    resetPermissionRequestCount,
    resolvePermissionStatus,
} from './permissionService';
import type { GeoCoordinates, PermissionCheckResult, PermissionRequestResult } from './types';

type CapPermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

function isCapGranted(state: CapPermissionState | undefined): boolean {
    return state === 'granted';
}

function canCapPrompt(state: CapPermissionState | undefined): boolean {
    return state === 'prompt' || state === 'prompt-with-rationale';
}

async function readNativeLocationPermission(): Promise<{ granted: boolean; canPrompt: boolean }> {
    const result = await Geolocation.checkPermissions();
    const loc = result.location as CapPermissionState | undefined;
    const coarse = result.coarseLocation as CapPermissionState | undefined;
    const granted = isCapGranted(loc) || isCapGranted(coarse);
    const canPrompt = canCapPrompt(loc) || canCapPrompt(coarse);
    return { granted, canPrompt };
}

async function ensureNativeLocationPermission(): Promise<{ granted: boolean; canPrompt: boolean }> {
    let state = await readNativeLocationPermission();
    if (state.granted) return state;

    const requested = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    const loc = requested.location as CapPermissionState | undefined;
    const coarse = requested.coarseLocation as CapPermissionState | undefined;
    const granted = isCapGranted(loc) || isCapGranted(coarse);
    if (granted) {
        resetPermissionRequestCount('location');
        return { granted: true, canPrompt: false };
    }

    state = await readNativeLocationPermission();
    if (!granted) incrementPermissionRequestCount('location');
    return state;
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
            const { granted, canPrompt } = await readNativeLocationPermission();
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

    if (isNativeAndroid()) {
        try {
            const { granted, canPrompt } = await ensureNativeLocationPermission();
            const status = resolvePermissionStatus('location', granted, canPrompt);
            return {
                status,
                canAskAgain: status !== 'permanently_denied' && status !== 'granted',
                message:
                    status === 'granted'
                        ? undefined
                        : status === 'permanently_denied'
                          ? PERMISSION_COPY.location.permanent
                          : PERMISSION_COPY.location.denied,
            };
        } catch (err) {
            permissionDevLog('native location request failed', err);
        }
    }

    incrementPermissionRequestCount('location');
    const web = await checkWebLocationPermission();
    const status = resolvePermissionStatus('location', web.granted, web.canPrompt);
    return {
        status,
        canAskAgain: status !== 'permanently_denied' && status !== 'granted',
        message:
            status === 'granted'
                ? undefined
                : status === 'permanently_denied'
                  ? PERMISSION_COPY.location.permanent
                  : PERMISSION_COPY.location.denied,
    };
}

export async function ensureLocationPermission(): Promise<PermissionRequestResult> {
    return requestLocationPermission();
}

export interface GetLocationOptions {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
}

function classifyLocationError(err: unknown): { message: string; locationServicesDisabled: boolean } {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    if (/location services|location service|provider|gps.*off|disabled/.test(lower)) {
        return { message: PERMISSION_COPY.location.gpsDisabled, locationServicesDisabled: true };
    }
    if (/denied|permission|not authorized|not allowed/.test(lower)) {
        return { message: PERMISSION_COPY.location.denied, locationServicesDisabled: false };
    }
    if (/timeout|timed out/.test(lower)) {
        return { message: 'Location request timed out. Try again.', locationServicesDisabled: false };
    }
    return { message: msg || 'Could not determine your location', locationServicesDisabled: false };
}

/**
 * Gets current coordinates. Uses native GPS when available — does not block on stale JS permission state.
 */
export async function getCurrentLocationWithPermission(
    options?: GetLocationOptions
): Promise<GeoCoordinates> {
    const timeout = options?.timeout ?? 20_000;
    const enableHighAccuracy = options?.enableHighAccuracy ?? true;
    const maximumAge = options?.maximumAge ?? 60_000;

    if (isNativeAndroid()) {
        await ensureNativeLocationPermission();
        try {
            const pos = await Geolocation.getCurrentPosition({
                enableHighAccuracy,
                timeout,
                maximumAge,
            });
            resetPermissionRequestCount('location');
            return {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
            };
        } catch (err: unknown) {
            const classified = classifyLocationError(err);
            const error = new Error(classified.message);
            (error as Error & { locationServicesDisabled?: boolean }).locationServicesDisabled =
                classified.locationServicesDisabled;
            throw error;
        }
    }

    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new Error('Location is not supported on this device'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resetPermissionRequestCount('location');
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                });
            },
            (err) => {
                const classified =
                    err.code === 1
                        ? { message: PERMISSION_COPY.location.denied, locationServicesDisabled: false }
                        : err.code === 2
                          ? { message: PERMISSION_COPY.location.gpsDisabled, locationServicesDisabled: true }
                          : err.code === 3
                            ? { message: 'Location request timed out. Try again.', locationServicesDisabled: false }
                            : classifyLocationError(err);
                const error = new Error(classified.message);
                (error as Error & { locationServicesDisabled?: boolean }).locationServicesDisabled =
                    classified.locationServicesDisabled;
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
