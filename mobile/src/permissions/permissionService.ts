/**
 * Central permission management — logging, storage, open settings, platform detection.
 */

import { Capacitor } from '@capacitor/core';
import { isNativeAndroid } from '../services/firebaseNative';
import { AppSettings } from './nativePlugins';
import { PERMISSION_STORAGE_KEYS } from './constants';
import type { PermissionKind, PermissionStatus } from './types';

function devLog(...args: unknown[]) {
    if (import.meta.env.DEV) {
        console.info('[Permissions]', ...args);
    }
}

export function isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
}

export function getPlatform(): string {
    return Capacitor.getPlatform();
}

function readRequestCount(key: string): number {
    try {
        const raw = localStorage.getItem(key);
        const n = raw ? parseInt(raw, 10) : 0;
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

function writeRequestCount(key: string, count: number) {
    try {
        localStorage.setItem(key, String(count));
    } catch {
        /* ignore */
    }
}

export function getPermissionRequestCount(kind: PermissionKind): number {
    const key =
        kind === 'microphone'
            ? PERMISSION_STORAGE_KEYS.micRequestCount
            : PERMISSION_STORAGE_KEYS.locationRequestCount;
    return readRequestCount(key);
}

export function incrementPermissionRequestCount(kind: PermissionKind): number {
    const key =
        kind === 'microphone'
            ? PERMISSION_STORAGE_KEYS.micRequestCount
            : PERMISSION_STORAGE_KEYS.locationRequestCount;
    const next = readRequestCount(key) + 1;
    writeRequestCount(key, next);
    return next;
}

export function resetPermissionRequestCount(kind: PermissionKind): void {
    const key =
        kind === 'microphone'
            ? PERMISSION_STORAGE_KEYS.micRequestCount
            : PERMISSION_STORAGE_KEYS.locationRequestCount;
    try {
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}

export function isOnboardingComplete(): boolean {
    try {
        return localStorage.getItem(PERMISSION_STORAGE_KEYS.onboardingDone) === '1';
    } catch {
        return false;
    }
}

export function markOnboardingComplete() {
    try {
        localStorage.setItem(PERMISSION_STORAGE_KEYS.onboardingDone, '1');
    } catch {
        /* ignore */
    }
}

export function resetPermissionRequestCounts(): void {
    resetPermissionRequestCount('microphone');
    resetPermissionRequestCount('location');
}

/** Maps OS permission state to UI status — does not use stale local request counts. */
export function resolvePermissionStatus(
    kind: PermissionKind,
    granted: boolean,
    canPrompt: boolean
): PermissionStatus {
    if (granted) {
        resetPermissionRequestCount(kind);
        return 'granted';
    }
    // Android "Don't ask again" — only trust OS signal, not local counters
    if (!canPrompt) return 'permanently_denied';
    return 'prompt';
}

export async function openAppSettings(): Promise<boolean> {
    devLog('openAppSettings');
    if (isNativeAndroid()) {
        try {
            await AppSettings.open();
            return true;
        } catch (err) {
            devLog('native open settings failed', err);
        }
    }
    // Web / fallback — show instructions (caller handles UX)
    return false;
}

export { devLog as permissionDevLog };
