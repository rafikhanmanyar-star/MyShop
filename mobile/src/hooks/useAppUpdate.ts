import { useCallback, useEffect, useRef, useState } from 'react';
import {
    bindPlayUpdateListeners,
    checkForUpdates,
    dismissOptionalUpdatePrompt,
    getLastUpdateSnapshot,
    installDownloadedUpdate,
    performUpdate,
    type UpdateCheckSnapshot,
} from '../services/updates/updateService';
import { wasUpdatePromptDismissedRecently } from '../services/updates/versionChecker';

export type UpdateUiPhase =
    | 'idle'
    | 'checking'
    | 'upToDate'
    | 'updateAvailable'
    | 'downloading'
    | 'readyToInstall'
    | 'error';

export function useAppUpdate() {
    const [snapshot, setSnapshot] = useState<UpdateCheckSnapshot | null>(getLastUpdateSnapshot);
    const [phase, setPhase] = useState<UpdateUiPhase>('idle');
    const [message, setMessage] = useState<string | null>(null);
    const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
    const busyRef = useRef(false);

    useEffect(() => {
        return bindPlayUpdateListeners(
            (e) => {
                if (e.totalBytesToDownload > 0) {
                    const pct = Math.min(100, Math.round((e.bytesDownloaded / e.totalBytesToDownload) * 100));
                    setDownloadPercent(pct);
                }
                setPhase('downloading');
            },
            () => {
                setPhase('readyToInstall');
                setDownloadPercent(100);
            },
            () => {
                setMessage('Download failed. Try again or open the Play Store.');
                setPhase('error');
            }
        );
    }, []);

    const runCheck = useCallback(async (opts?: { silent?: boolean }) => {
        if (busyRef.current) return getLastUpdateSnapshot();
        busyRef.current = true;
        if (!opts?.silent) setPhase('checking');
        setMessage(null);
        try {
            const result = await checkForUpdates({ silent: opts?.silent });
            setSnapshot(result);

            if (result.error && !result.backend) {
                setPhase('error');
                setMessage(result.error);
                return result;
            }

            const needsUpdate =
                result.backend?.updateAvailable ||
                result.playUpdateAvailable ||
                result.backend?.forceUpdateRequired;

            if (!needsUpdate) {
                setPhase('upToDate');
            } else {
                setPhase('updateAvailable');
            }
            return result;
        } finally {
            busyRef.current = false;
        }
    }, []);

    const startUpdate = useCallback(async () => {
        const snap = snapshot ?? (await runCheck());
        if (!snap) return;
        setMessage(null);
        const result = await performUpdate(snap);
        if (!result.ok) {
            setMessage(result.message);
            setPhase('error');
            return;
        }
        if (result.mode === 'flexible') {
            setPhase('downloading');
        }
    }, [snapshot, runCheck]);

    const installAndRestart = useCallback(async () => {
        const result = await installDownloadedUpdate();
        if (!result.ok) {
            setMessage(result.message);
            setPhase('error');
        }
    }, []);

    const dismissLater = useCallback(() => {
        dismissOptionalUpdatePrompt();
    }, []);

    const shouldShowStartupPrompt = useCallback(
        (snap: UpdateCheckSnapshot) => {
            if (snap.backend?.forceUpdateRequired) return true;
            if (!snap.backend?.updateAvailable) return false;
            return !wasUpdatePromptDismissedRecently();
        },
        []
    );

    return {
        snapshot,
        phase,
        message,
        downloadPercent,
        runCheck,
        startUpdate,
        installAndRestart,
        dismissLater,
        shouldShowStartupPrompt,
        setPhase,
        setMessage,
    };
}
