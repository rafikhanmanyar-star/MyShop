import { App } from '@capacitor/app';
import { isNativeAndroid } from '../firebaseNative';
import {
    bindPlayUpdateListeners,
    checkPlayStoreUpdate,
    completeFlexibleUpdate,
    getNativeAppInfo,
    isPlayUpdateSupported,
    openPlayStoreListing,
    startPlayUpdate,
    type UpdateFlowMode,
} from './playStoreUpdateManager';
import {
    fetchVersionPolicy,
    markUpdatePromptDismissed,
    type VersionCheckResult,
} from './versionChecker';

export type AppVersionInfo = {
    version: string;
    build?: number;
    displayVersion: string;
};

export type UpdateCheckSnapshot = {
    app: AppVersionInfo;
    backend: VersionCheckResult | null;
    playUpdateAvailable: boolean;
    playImmediateAllowed: boolean;
    playFlexibleAllowed: boolean;
    error: string | null;
    checkedAt: number;
};

export type UpdateActionResult =
    | { ok: true; mode: UpdateFlowMode | 'playStore' | 'pwa' }
    | { ok: false; message: string };

let lastSnapshot: UpdateCheckSnapshot | null = null;

export function getLastUpdateSnapshot(): UpdateCheckSnapshot | null {
    return lastSnapshot;
}

/** Resolve current app version — native build on Android, else web bundle version. */
export async function resolveAppVersionInfo(): Promise<AppVersionInfo> {
    if (isPlayUpdateSupported()) {
        const native = await getNativeAppInfo();
        if (native) {
            return {
                version: native.version,
                build: native.build,
                displayVersion: native.version,
            };
        }
        try {
            const info = await App.getInfo();
            return {
                version: info.version,
                build: typeof info.build === 'string' ? parseInt(info.build, 10) : info.build,
                displayVersion: info.version,
            };
        } catch {
            /* fall through */
        }
    }

    const webVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
    return { version: webVersion, displayVersion: webVersion };
}

/**
 * Combined backend policy + Play Store availability check.
 */
export async function checkForUpdates(options?: { silent?: boolean }): Promise<UpdateCheckSnapshot> {
    const app = await resolveAppVersionInfo();
    let backend: VersionCheckResult | null = null;
    let playUpdateAvailable = false;
    let playImmediateAllowed = false;
    let playFlexibleAllowed = false;
    let error: string | null = null;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        error = 'No internet connection. Connect and try again.';
    } else {
        try {
            backend = await fetchVersionPolicy(app.version, app.build);
        } catch (e) {
            error = e instanceof Error ? e.message : 'Could not check for updates';
            if (!options?.silent && import.meta.env.DEV) {
                console.warn('[updateService] backend check failed', e);
            }
        }

        if (isPlayUpdateSupported()) {
            try {
                const play = await checkPlayStoreUpdate();
                if (play) {
                    playUpdateAvailable = play.updateAvailable;
                    playImmediateAllowed = play.immediateAllowed;
                    playFlexibleAllowed = play.flexibleAllowed;
                }
            } catch (e) {
                if (!error) {
                    error = e instanceof Error ? e.message : 'Play Store check failed';
                }
            }
        }
    }

    const snapshot: UpdateCheckSnapshot = {
        app,
        backend,
        playUpdateAvailable,
        playImmediateAllowed,
        playFlexibleAllowed,
        error,
        checkedAt: Date.now(),
    };
    lastSnapshot = snapshot;
    return snapshot;
}

export function shouldShowUpdatePrompt(snapshot: UpdateCheckSnapshot): boolean {
    if (!snapshot.backend) return false;
    if (!snapshot.backend.updateAvailable) return false;
    return true;
}

export function pickUpdateMode(snapshot: UpdateCheckSnapshot): UpdateFlowMode {
    if (snapshot.backend?.forceUpdateRequired) return 'immediate';
    if (snapshot.playImmediateAllowed && snapshot.backend?.forceUpdateRequired) return 'immediate';
    if (snapshot.playFlexibleAllowed) return 'flexible';
    if (snapshot.playImmediateAllowed) return 'immediate';
    return 'flexible';
}

/**
 * Start update: Play in-app flow on Android, PWA reload event on web, Play listing as fallback.
 */
export async function performUpdate(snapshot: UpdateCheckSnapshot): Promise<UpdateActionResult> {
    if (!navigator.onLine) {
        return { ok: false, message: 'No internet connection' };
    }

    const force = snapshot.backend?.forceUpdateRequired === true;
    const mode = pickUpdateMode(snapshot);

    if (isNativeAndroid()) {
        const play = await checkPlayStoreUpdate();
        const canPlay =
            play?.updateAvailable &&
            ((mode === 'immediate' && play.immediateAllowed) ||
                (mode === 'flexible' && play.flexibleAllowed) ||
                play.flexibleAllowed ||
                play.immediateAllowed);

        if (canPlay) {
            try {
                const useImmediate = force || (mode === 'immediate' && play.immediateAllowed);
                await startPlayUpdate(useImmediate ? 'immediate' : 'flexible');
                return { ok: true, mode: useImmediate ? 'immediate' : 'flexible' };
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Update could not start';
                if (msg.toLowerCase().includes('cancel')) {
                    return { ok: false, message: 'Update cancelled' };
                }
                try {
                    await openPlayStoreListing();
                    return { ok: true, mode: 'playStore' };
                } catch {
                    return { ok: false, message: msg };
                }
            }
        }

        try {
            await openPlayStoreListing();
            return { ok: true, mode: 'playStore' };
        } catch {
            return { ok: false, message: 'Play Store is not available on this device' };
        }
    }

    // PWA / browser: trigger service worker update check
    window.dispatchEvent(new CustomEvent('pwa-check-update'));
    return { ok: true, mode: 'pwa' };
}

export async function installDownloadedUpdate(): Promise<UpdateActionResult> {
    if (!isPlayUpdateSupported()) {
        return { ok: false, message: 'Not supported on this platform' };
    }
    try {
        await completeFlexibleUpdate();
        return { ok: true, mode: 'flexible' };
    } catch (e) {
        return {
            ok: false,
            message: e instanceof Error ? e.message : 'Could not install update',
        };
    }
}

export function dismissOptionalUpdatePrompt(): void {
    markUpdatePromptDismissed();
}

export { bindPlayUpdateListeners, openPlayStoreListing };
