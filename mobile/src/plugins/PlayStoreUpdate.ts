import { registerPlugin } from '@capacitor/core';

export type PlayUpdateInfo = {
    updateAvailable: boolean;
    flexibleAllowed: boolean;
    immediateAllowed: boolean;
    availableVersionCode: number;
    installStatus?: number;
    clientVersionStalenessDays?: number;
};

export type NativeAppInfo = {
    version: string;
    build: number;
    packageId: string;
};

export type FlexibleProgressEvent = {
    installStatus: number;
    bytesDownloaded: number;
    totalBytesToDownload: number;
};

export interface PlayStoreUpdatePlugin {
    getAppInfo(): Promise<NativeAppInfo>;
    checkPlayUpdate(): Promise<PlayUpdateInfo>;
    startFlexibleUpdate(): Promise<{ accepted: boolean; immediate: boolean }>;
    startImmediateUpdate(): Promise<{ accepted: boolean; immediate: boolean }>;
    completeFlexibleUpdate(): Promise<void>;
    openPlayStore(): Promise<void>;
    addListener(
        eventName: 'flexibleUpdateDownloaded' | 'flexibleUpdateProgress' | 'flexibleUpdateFailed',
        listenerFunc: (event: FlexibleProgressEvent) => void
    ): Promise<{ remove: () => void }>;
}

export const PlayStoreUpdate = registerPlugin<PlayStoreUpdatePlugin>('PlayStoreUpdate');
