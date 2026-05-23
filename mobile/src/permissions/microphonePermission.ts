/**
 * Microphone permission — voice orders (MediaRecorder) and voice search.
 * Native Android: RECORD_AUDIO via Capacitor plugin + WebView getUserMedia probe.
 * Web/PWA: getUserMedia is the source of truth for MediaRecorder.
 */

import { isNativeAndroid } from '../services/firebaseNative';
import { PERMISSION_COPY } from './constants';
import {
    incrementPermissionRequestCount,
    permissionDevLog,
    resetPermissionRequestCount,
    resolvePermissionStatus,
} from './permissionService';
import { MicrophonePermission } from './nativePlugins';
import type { PermissionCheckResult, PermissionRequestResult } from './types';

/** Whether the WebView can actually open a mic stream (what MediaRecorder needs). */
export async function probeMicrophoneAccess(): Promise<boolean> {
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

async function ensureNativeAppMicPermission(): Promise<{ granted: boolean; canPrompt: boolean }> {
    try {
        const { granted } = await MicrophonePermission.check();
        if (granted) return { granted: true, canPrompt: false };

        const result = await MicrophonePermission.request();
        if (result.granted) {
            resetPermissionRequestCount('microphone');
            return { granted: true, canPrompt: false };
        }

        const recheck = await MicrophonePermission.check();
        return { granted: recheck.granted, canPrompt: !recheck.granted };
    } catch (err) {
        permissionDevLog('native mic plugin failed', err);
        return { granted: false, canPrompt: true };
    }
}

export async function checkMicrophonePermission(): Promise<PermissionCheckResult> {
    permissionDevLog('checkMicrophone');

    if (await probeMicrophoneAccess()) {
        resetPermissionRequestCount('microphone');
        return { status: 'granted' };
    }

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

    return {
        status: 'prompt',
        message: PERMISSION_COPY.microphone.denied,
    };
}

export async function requestMicrophonePermission(): Promise<PermissionRequestResult> {
    permissionDevLog('requestMicrophone');

    if (isNativeAndroid()) {
        const appPerm = await ensureNativeAppMicPermission();
        if (!appPerm.granted) {
            incrementPermissionRequestCount('microphone');
        }
    }

    if (await probeMicrophoneAccess()) {
        resetPermissionRequestCount('microphone');
        return { status: 'granted', canAskAgain: false };
    }

    if (isNativeAndroid()) {
        const { granted, canPrompt } = await ensureNativeAppMicPermission();
        const status = resolvePermissionStatus('microphone', granted, canPrompt);
        return {
            status,
            canAskAgain: status !== 'permanently_denied' && status !== 'granted',
            message:
                status === 'granted'
                    ? undefined
                    : status === 'permanently_denied'
                      ? PERMISSION_COPY.microphone.permanent
                      : PERMISSION_COPY.microphone.denied,
        };
    }

    incrementPermissionRequestCount('microphone');
    const granted = await probeMicrophoneAccess();
    const status = granted ? 'granted' : 'denied';
    if (granted) resetPermissionRequestCount('microphone');

    return {
        status,
        canAskAgain: !granted,
        message: granted ? undefined : PERMISSION_COPY.microphone.denied,
    };
}

/** Ensures mic access before starting MediaRecorder or speech recognition. */
export async function ensureMicrophoneForRecording(): Promise<PermissionRequestResult> {
    if (await probeMicrophoneAccess()) {
        resetPermissionRequestCount('microphone');
        return { status: 'granted', canAskAgain: false };
    }

    if (isNativeAndroid()) {
        await ensureNativeAppMicPermission();
    }

    if (await probeMicrophoneAccess()) {
        resetPermissionRequestCount('microphone');
        return { status: 'granted', canAskAgain: false };
    }

    const check = await checkMicrophonePermission();
    if (check.status === 'granted') {
        return { ...check, canAskAgain: false };
    }

    return requestMicrophonePermission();
}

export function isMicrophoneGranted(result: PermissionCheckResult | PermissionRequestResult): boolean {
    return result.status === 'granted';
}
