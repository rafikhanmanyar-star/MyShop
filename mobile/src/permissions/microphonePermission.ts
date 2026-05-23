/**
 * Microphone permission — voice orders (MediaRecorder) and voice search.
 * Native Android: custom Capacitor plugin (RECORD_AUDIO).
 * Web/PWA: Permissions API + getUserMedia probe.
 */

import { isNativeAndroid } from '../services/firebaseNative';
import { PERMISSION_COPY } from './constants';
import {
    incrementPermissionRequestCount,
    permissionDevLog,
    resolvePermissionStatus,
} from './permissionService';
import { MicrophonePermission } from './nativePlugins';
import type { PermissionCheckResult, PermissionRequestResult } from './types';

async function checkWebMicrophone(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;

    try {
        const perm = navigator.permissions as Permissions | undefined;
        if (perm?.query) {
            const status = await perm.query({ name: 'microphone' as PermissionName });
            if (status.state === 'granted') return true;
            if (status.state === 'denied') return false;
        }
    } catch {
        /* Permissions API may be unavailable */
    }

    if (!navigator.mediaDevices?.getUserMedia) return false;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        return true;
    } catch {
        return false;
    }
}

async function requestWebMicrophone(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return false;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        return true;
    } catch {
        return false;
    }
}

export async function checkMicrophonePermission(): Promise<PermissionCheckResult> {
    permissionDevLog('checkMicrophone');

    if (isNativeAndroid()) {
        try {
            const { granted } = await MicrophonePermission.check();
            const status = resolvePermissionStatus('microphone', granted, !granted);
            return {
                status,
                message: granted ? undefined : PERMISSION_COPY.microphone.denied,
            };
        } catch (err) {
            permissionDevLog('native mic check failed', err);
        }
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return {
            status: 'unavailable',
            message: 'Microphone is not supported on this device.',
        };
    }

    const granted = await checkWebMicrophone();
    const status = resolvePermissionStatus('microphone', granted, !granted);
    return {
        status,
        message: granted ? undefined : PERMISSION_COPY.microphone.denied,
    };
}

export async function requestMicrophonePermission(): Promise<PermissionRequestResult> {
    permissionDevLog('requestMicrophone');
    incrementPermissionRequestCount('microphone');

    let granted = false;

    if (isNativeAndroid()) {
        try {
            const result = await MicrophonePermission.request();
            granted = result.granted;
        } catch (err) {
            permissionDevLog('native mic request failed', err);
        }
    } else {
        granted = await requestWebMicrophone();
    }

    const status = resolvePermissionStatus('microphone', granted, !granted);
    const canAskAgain = status !== 'permanently_denied' && status !== 'granted';

    return {
        status,
        canAskAgain,
        message:
            status === 'granted'
                ? undefined
                : status === 'permanently_denied'
                  ? PERMISSION_COPY.microphone.permanent
                  : PERMISSION_COPY.microphone.denied,
    };
}

/** Ensures mic access before starting MediaRecorder or speech recognition. */
export async function ensureMicrophoneForRecording(): Promise<PermissionRequestResult> {
    const current = await checkMicrophonePermission();
    if (current.status === 'granted') {
        return { ...current, canAskAgain: false };
    }
    if (current.status === 'permanently_denied') {
        return {
            ...current,
            canAskAgain: false,
            message: PERMISSION_COPY.microphone.permanent,
        };
    }
    return requestMicrophonePermission();
}

export function isMicrophoneGranted(result: PermissionCheckResult | PermissionRequestResult): boolean {
    return result.status === 'granted';
}
