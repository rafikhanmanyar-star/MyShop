import { useCallback, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { isPlayUpdateSupported } from '../services/updates/playStoreUpdateManager';
function statusLabel(
    phase: string,
    snapshot: ReturnType<typeof useAppUpdate>['snapshot'],
    message: string | null
): { title: string; detail: string; tone: 'neutral' | 'success' | 'warn' | 'error' } {
    if (phase === 'checking') {
        return { title: 'Checking…', detail: 'Looking for updates', tone: 'neutral' };
    }
    if (phase === 'error' && message) {
        return { title: 'Could not check', detail: message, tone: 'error' };
    }
    if (phase === 'downloading') {
        return { title: 'Downloading update', detail: 'You can keep using the app', tone: 'neutral' };
    }
    if (phase === 'readyToInstall') {
        return { title: 'Ready to install', detail: 'Restart to apply the update', tone: 'success' };
    }
    if (snapshot?.backend?.forceUpdateRequired) {
        return {
            title: 'Update required',
            detail: `Minimum version v${snapshot.backend.policy.minimumSupportedVersion}`,
            tone: 'warn',
        };
    }
    if (snapshot?.backend?.updateAvailable || snapshot?.playUpdateAvailable) {
        const latest = snapshot.backend?.policy.latestVersion;
        return {
            title: 'New version available',
            detail: latest ? `Latest: v${latest}` : 'Update available on Play Store',
            tone: 'success',
        };
    }
    if (phase === 'upToDate') {
        return { title: "You're up to date", detail: 'No updates available', tone: 'success' };
    }
    return { title: 'Check for updates', detail: 'Tap below to check', tone: 'neutral' };
}

export default function CheckForUpdatesPage() {
    const { shopSlug } = useParams();
    const {
        snapshot,
        phase,
        message,
        downloadPercent,
        runCheck,
        startUpdate,
        installAndRestart,
    } = useAppUpdate();

    const base = shopSlug ? `/${shopSlug}` : '/';

    useEffect(() => {
        void runCheck();
    }, [runCheck]);

    const handleCheck = useCallback(() => {
        void runCheck();
    }, [runCheck]);

    if (!shopSlug) return null;

    const appVersion = snapshot?.app.displayVersion ?? '…';
    const status = statusLabel(phase, snapshot, message);
    const notes = snapshot?.backend?.policy.releaseNotes ?? [];
    const latest = snapshot?.backend?.policy.latestVersion;
    const showUpdateBtn =
        phase === 'updateAvailable' ||
        phase === 'error' ||
        snapshot?.backend?.updateAvailable ||
        snapshot?.playUpdateAvailable;
    const showInstallBtn = phase === 'readyToInstall';

    return (
        <div className="page fade-in check-updates-page" style={{ paddingBottom: 100 }}>
            <Link
                to={`${base}/utilities`}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 14,
                    color: 'var(--primary)',
                    marginBottom: 16,
                    textDecoration: 'none',
                    fontWeight: 600,
                }}
            >
                ← Utilities
            </Link>

            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Check for Updates</h1>

            <div className="check-updates-card">
                <div className="check-updates-card__row">
                    <span className="check-updates-card__label">Current version</span>
                    <span className="check-updates-card__value">v{appVersion}</span>
                </div>
                {snapshot?.app.build != null && isPlayUpdateSupported() && (
                    <div className="check-updates-card__row">
                        <span className="check-updates-card__label">Build</span>
                        <span className="check-updates-card__value">{snapshot.app.build}</span>
                    </div>
                )}
                <div className="check-updates-card__divider" />
                <div className={`check-updates-status check-updates-status--${status.tone}`}>
                    <div className="check-updates-status__title">{status.title}</div>
                    <div className="check-updates-status__detail">{status.detail}</div>
                </div>

                {phase === 'downloading' && (
                    <div className="update-modal__progress" style={{ marginTop: 12 }}>
                        <div
                            className="update-modal__progress-bar"
                            style={{ width: `${downloadPercent ?? 0}%` }}
                        />
                    </div>
                )}
            </div>

            {notes.length > 0 && (showUpdateBtn || latest) && (
                <div className="check-updates-notes">
                    <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>What&apos;s new</h2>
                    <ul>
                        {notes.map((note) => (
                            <li key={note}>{note}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="check-updates-actions">
                <button type="button" className="btn btn-secondary btn-full" onClick={handleCheck} disabled={phase === 'checking'}>
                    {phase === 'checking' ? 'Checking…' : 'Check again'}
                </button>

                {showInstallBtn && (
                    <button type="button" className="btn btn-primary btn-full" onClick={() => void installAndRestart()}>
                        Install &amp; restart
                    </button>
                )}

                {showUpdateBtn && !showInstallBtn && (
                    <button type="button" className="btn btn-primary btn-full" onClick={() => void startUpdate()}>
                        Update now
                    </button>
                )}

                {!isPlayUpdateSupported() && (
                    <p className="check-updates-hint">
                        On the web app, updates install when you refresh after a new version is deployed.
                    </p>
                )}
            </div>
        </div>
    );
}
