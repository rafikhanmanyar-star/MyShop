/**
 * Lightweight native Capacitor plugins (Android shell only).
 * Implemented in android/app/src/main/java/com/obostores/customer/
 */

import { registerPlugin } from '@capacitor/core';
import { isNativeAndroid } from '../services/firebaseNative';

export interface MicrophonePermissionPlugin {
    check(): Promise<{ granted: boolean }>;
    request(): Promise<{ granted: boolean }>;
}

export interface AppSettingsPlugin {
    open(): Promise<void>;
}

export const MicrophonePermission = registerPlugin<MicrophonePermissionPlugin>('MicrophonePermission');

export const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings');

export function hasNativePermissionPlugins(): boolean {
    return isNativeAndroid();
}
