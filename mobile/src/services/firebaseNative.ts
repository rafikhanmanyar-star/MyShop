/**
 * Firebase native integration (Android Capacitor shell only).
 * No-op in browser/PWA — preserves existing web behavior.
 */

import { Capacitor } from '@capacitor/core';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

const FCM_TOKEN_STORAGE_KEY = 'myshop_fcm_token_v1';

let initStarted = false;
let initDone = false;

function devLog(...args: unknown[]) {
    if (import.meta.env.DEV) {
        console.info('[Firebase]', ...args);
    }
}

export function isNativeAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function getStoredFcmToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        return localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
}

function persistFcmToken(token: string) {
    try {
        localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
    } catch {
        /* ignore */
    }
}

export async function logAnalyticsEvent(
    name: string,
    params?: Record<string, string | number | null>
): Promise<void> {
    if (!isNativeAndroid()) return;
    try {
        await FirebaseAnalytics.logEvent({ name, params: params ?? {} });
    } catch (err) {
        devLog('analytics event failed', name, err);
    }
}

export async function recordNonFatalError(message: string): Promise<void> {
    if (!isNativeAndroid()) return;
    try {
        await FirebaseCrashlytics.recordException({ message });
    } catch (err) {
        devLog('recordException failed', err);
    }
}

/** Forces a test crash — development / native Android only. */
export async function triggerTestCrash(): Promise<void> {
    if (!import.meta.env.DEV || !isNativeAndroid()) return;
    await FirebaseCrashlytics.crash({ message: 'MyShop dev test crash' });
}

async function setupMessaging(): Promise<void> {
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        await FirebaseMessaging.requestPermissions();
    }

    await FirebaseMessaging.createChannel({
        id: 'orders',
        name: 'Order updates',
        description: 'Order status and delivery notifications',
        importance: 4,
        visibility: 1,
        sound: 'default',
        vibration: true,
    });

    const { token } = await FirebaseMessaging.getToken();
    if (token) {
        persistFcmToken(token);
        devLog('FCM token', token);
    }

    await FirebaseMessaging.addListener('tokenReceived', (event) => {
        if (event.token) {
            persistFcmToken(event.token);
            devLog('FCM token refreshed', event.token);
        }
    });

    await FirebaseMessaging.addListener('notificationReceived', (event) => {
        devLog('foreground notification', event.notification);
    });

    await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
        devLog('notification action', event);
    });
}

async function setupCrashlytics(): Promise<void> {
    await FirebaseCrashlytics.setEnabled({ enabled: true });
    const { enabled } = await FirebaseCrashlytics.isEnabled();
    devLog('Crashlytics enabled', enabled);
    const { crashed } = await FirebaseCrashlytics.didCrashOnPreviousExecution();
    if (crashed) {
        devLog('App crashed on previous run');
    }
}

/**
 * Initialize Firebase on native Android once per app session.
 */
export async function initializeFirebaseNative(): Promise<void> {
    if (!isNativeAndroid() || initStarted) return;
    initStarted = true;

    try {
        devLog('initializing native Firebase…');
        await setupCrashlytics();
        await setupMessaging();
        await logAnalyticsEvent('app_open');
        initDone = true;
        devLog('native Firebase ready');
    } catch (err) {
        devLog('initialization failed', err);
        void recordNonFatalError(
            err instanceof Error ? err.message : 'Firebase native init failed'
        );
    }
}

export function isFirebaseNativeReady(): boolean {
    return initDone;
}
