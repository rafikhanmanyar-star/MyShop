import { Capacitor } from '@capacitor/core';
import {
    PlayStoreUpdate,
    type FlexibleProgressEvent,
    type NativeAppInfo,
    type PlayUpdateInfo,
} from '../../plugins/PlayStoreUpdate';

export type UpdateFlowMode = 'flexible' | 'immediate';

export type PlayUpdateState =
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'failed'
    | 'unavailable';

export function isPlayUpdateSupported(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function getNativeAppInfo(): Promise<NativeAppInfo | null> {
    if (!isPlayUpdateSupported()) return null;
    try {
        return await PlayStoreUpdate.getAppInfo();
    } catch {
        return null;
    }
}

export async function checkPlayStoreUpdate(): Promise<PlayUpdateInfo | null> {
    if (!isPlayUpdateSupported()) return null;
    try {
        return await PlayStoreUpdate.checkPlayUpdate();
    } catch {
        return null;
    }
}

export async function startPlayUpdate(mode: UpdateFlowMode): Promise<void> {
    if (!isPlayUpdateSupported()) {
        throw new Error('In-app updates are only available on Android');
    }
    if (mode === 'immediate') {
        await PlayStoreUpdate.startImmediateUpdate();
    } else {
        await PlayStoreUpdate.startFlexibleUpdate();
    }
}

export async function completeFlexibleUpdate(): Promise<void> {
    if (!isPlayUpdateSupported()) return;
    await PlayStoreUpdate.completeFlexibleUpdate();
}

export async function openPlayStoreListing(): Promise<void> {
    if (isPlayUpdateSupported()) {
        try {
            await PlayStoreUpdate.openPlayStore();
            return;
        } catch {
            /* fallback below */
        }
    }
    const pkg = 'com.obostores.customer';
    const market = `market://details?id=${pkg}`;
    const web = `https://play.google.com/store/apps/details?id=${pkg}`;
    try {
        window.open(market, '_system');
    } catch {
        window.open(web, '_blank', 'noopener,noreferrer');
    }
}

type ProgressListener = (event: FlexibleProgressEvent) => void;

let listenersBound = false;
const progressHandlers = new Set<ProgressListener>();
const downloadedHandlers = new Set<() => void>();
const failedHandlers = new Set<() => void>();

/** Subscribe to flexible download events from the native Play Core listener. */
export function bindPlayUpdateListeners(
    onProgress: ProgressListener,
    onDownloaded: () => void,
    onFailed: () => void
): () => void {
    progressHandlers.add(onProgress);
    downloadedHandlers.add(onDownloaded);
    failedHandlers.add(onFailed);

    if (!listenersBound && isPlayUpdateSupported()) {
        listenersBound = true;
        void PlayStoreUpdate.addListener('flexibleUpdateProgress', (e) => {
            progressHandlers.forEach((h) => h(e));
        });
        void PlayStoreUpdate.addListener('flexibleUpdateDownloaded', () => {
            downloadedHandlers.forEach((h) => h());
        });
        void PlayStoreUpdate.addListener('flexibleUpdateFailed', () => {
            failedHandlers.forEach((h) => h());
        });
    }

    return () => {
        progressHandlers.delete(onProgress);
        downloadedHandlers.delete(onDownloaded);
        failedHandlers.delete(onFailed);
    };
}
