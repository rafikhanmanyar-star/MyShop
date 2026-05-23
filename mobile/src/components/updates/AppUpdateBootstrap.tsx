import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import UpdateDialog, { policyFromSnapshot } from './UpdateDialog';

const STARTUP_DELAY_MS = 2200;

/**
 * Silent version check on launch + compact update modal.
 * Skips landing page (no shop context). Respects 24h "Later" cooldown unless force-update.
 */
export default function AppUpdateBootstrap() {
    const { pathname } = useLocation();
    const {
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
    } = useAppUpdate();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogVariant, setDialogVariant] = useState<'startup' | 'force' | 'flexibleReady'>('startup');
    const checkedRef = useRef(false);

    const isShopRoute = /^\/[^/]+/.test(pathname) && pathname !== '/';

    const runStartupCheck = useCallback(async () => {
        if (!isShopRoute || checkedRef.current) return;
        checkedRef.current = true;

        const result = await runCheck({ silent: true });
        if (!result) return;

        if (result.backend?.forceUpdateRequired) {
            setDialogVariant('force');
            setDialogOpen(true);
            return;
        }

        if (shouldShowStartupPrompt(result)) {
            setDialogVariant('startup');
            setDialogOpen(true);
        }
    }, [isShopRoute, runCheck, shouldShowStartupPrompt]);

    useEffect(() => {
        if (!isShopRoute) return;
        const timer = window.setTimeout(() => {
            void runStartupCheck();
        }, STARTUP_DELAY_MS);
        return () => clearTimeout(timer);
    }, [isShopRoute, runStartupCheck]);

    useEffect(() => {
        if (phase === 'readyToInstall') {
            setDialogVariant('flexibleReady');
            setDialogOpen(true);
        }
    }, [phase]);

    useEffect(() => {
        const onManualCheck = () => {
            void (async () => {
                const result = await runCheck();
                if (
                    result &&
                    (result.backend?.updateAvailable ||
                        result.playUpdateAvailable ||
                        result.backend?.forceUpdateRequired)
                ) {
                    setDialogVariant(result.backend?.forceUpdateRequired ? 'force' : 'startup');
                    setDialogOpen(true);
                }
            })();
        };
        window.addEventListener('myshop:check-app-update', onManualCheck);
        return () => window.removeEventListener('myshop:check-app-update', onManualCheck);
    }, [runCheck]);

    const handleUpdate = () => {
        void startUpdate();
    };

    const handleLater = () => {
        dismissLater();
        setDialogOpen(false);
        setPhase('idle');
    };

    const handleInstall = () => {
        void installAndRestart();
    };

    if (!dialogOpen || !snapshot) return null;

    const policy = policyFromSnapshot(snapshot.backend?.policy);
    const force = snapshot.backend?.forceUpdateRequired === true;

    return (
        <UpdateDialog
            variant={dialogVariant}
            currentVersion={snapshot.app.displayVersion}
            latestVersion={policy.latestVersion}
            releaseNotes={policy.releaseNotes}
            force={force}
            downloading={phase === 'downloading'}
            downloadPercent={downloadPercent}
            errorMessage={phase === 'error' ? message : null}
            onUpdate={handleUpdate}
            onLater={force ? undefined : handleLater}
            onInstallRestart={handleInstall}
            onDismissError={() => {
                setMessage(null);
                setPhase('idle');
                if (!force) setDialogOpen(false);
            }}
        />
    );
}

/** Dispatch from Header menu or utilities page. */
export function requestAppUpdateCheck(): void {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        window.dispatchEvent(new CustomEvent('myshop:check-app-update'));
    } else {
        window.dispatchEvent(new CustomEvent('pwa-check-update'));
    }
}
