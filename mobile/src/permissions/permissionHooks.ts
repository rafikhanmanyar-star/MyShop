/**
 * React hooks for permission state and contextual request flows.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    checkLocationPermission,
    ensureLocationPermission,
    getCurrentLocationWithPermission,
    requestLocationPermission,
} from './locationPermission';
import {
    checkMicrophonePermission,
    ensureMicrophoneForRecording,
    requestMicrophonePermission,
} from './microphonePermission';
import { openAppSettings } from './permissionService';
import type { GeoCoordinates, PermissionCheckResult, PermissionKind, PermissionRequestResult } from './types';

type UsePermissionState = {
    status: PermissionCheckResult['status'];
    loading: boolean;
    message?: string;
    refresh: () => Promise<void>;
    request: () => Promise<PermissionRequestResult>;
    openSettings: () => Promise<boolean>;
};

function usePermissionBase(
    kind: PermissionKind,
    checkFn: () => Promise<PermissionCheckResult>,
    requestFn: () => Promise<PermissionRequestResult>
): UsePermissionState {
    const [status, setStatus] = useState<PermissionCheckResult['status']>('unknown');
    const [message, setMessage] = useState<string | undefined>();
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const result = await checkFn();
            setStatus(result.status);
            setMessage(result.message);
        } finally {
            setLoading(false);
        }
    }, [checkFn]);

    const request = useCallback(async () => {
        setLoading(true);
        try {
            const result = await requestFn();
            setStatus(result.status);
            setMessage(result.message);
            return result;
        } finally {
            setLoading(false);
        }
    }, [requestFn]);

    useEffect(() => {
        void refresh();
    }, [refresh, kind]);

    const openSettings = useCallback(() => openAppSettings(), []);

    return { status, loading, message, refresh, request, openSettings };
}

export function useMicrophonePermission(): UsePermissionState {
    return usePermissionBase('microphone', checkMicrophonePermission, requestMicrophonePermission);
}

export function useLocationPermission(): UsePermissionState {
    return usePermissionBase('location', checkLocationPermission, requestLocationPermission);
}

/** Combines location permission + coordinate fetch with loading/error state. */
export function useCurrentLocation() {
    const [coords, setCoords] = useState<GeoCoordinates | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [gpsDisabled, setGpsDisabled] = useState(false);

    const fetchLocation = useCallback(async () => {
        setLoading(true);
        setError(null);
        setGpsDisabled(false);
        try {
            const pos = await getCurrentLocationWithPermission();
            setCoords(pos);
            return pos;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Could not get location';
            setError(msg);
            const disabled = (e as Error & { locationServicesDisabled?: boolean }).locationServicesDisabled;
            setGpsDisabled(Boolean(disabled) || /GPS|location services/i.test(msg));
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return { coords, loading, error, gpsDisabled, fetchLocation };
}

/** Pre-flight before voice recording or voice search. */
export function useEnsureMicrophone() {
    const [checking, setChecking] = useState(false);

    const ensure = useCallback(async (): Promise<PermissionRequestResult> => {
        setChecking(true);
        try {
            return await ensureMicrophoneForRecording();
        } finally {
            setChecking(false);
        }
    }, []);

    return { ensure, checking };
}

/** Pre-flight before GPS capture at checkout. */
export function useEnsureLocation() {
    const [checking, setChecking] = useState(false);

    const ensure = useCallback(async (): Promise<PermissionRequestResult> => {
        setChecking(true);
        try {
            return await ensureLocationPermission();
        } finally {
            setChecking(false);
        }
    }, []);

    return { ensure, checking };
}

export function isPermissionBlocked(status: PermissionCheckResult['status']): boolean {
    return status === 'denied' || status === 'permanently_denied';
}

export function shouldShowOpenSettings(status: PermissionCheckResult['status']): boolean {
    return status === 'permanently_denied';
}
