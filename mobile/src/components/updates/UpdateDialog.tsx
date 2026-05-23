import type { AppVersionPolicyResponse } from '../../services/updates/versionChecker';

export type UpdateDialogVariant = 'startup' | 'force' | 'flexibleReady' | 'manual';

type Props = {
    variant: UpdateDialogVariant;
    currentVersion: string;
    latestVersion?: string;
    releaseNotes?: string[];
    force?: boolean;
    downloading?: boolean;
    downloadPercent?: number | null;
    errorMessage?: string | null;
    onUpdate: () => void;
    onLater?: () => void;
    onInstallRestart?: () => void;
    onDismissError?: () => void;
};

function IconUpdate() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
        </svg>
    );
}

export default function UpdateDialog({
    variant,
    currentVersion,
    latestVersion,
    releaseNotes = [],
    force = false,
    downloading = false,
    downloadPercent,
    errorMessage,
    onUpdate,
    onLater,
    onInstallRestart,
    onDismissError,
}: Props) {
    const isReady = variant === 'flexibleReady';
    const title = isReady
        ? 'Update ready'
        : force || variant === 'force'
          ? 'Update required'
          : 'New update available';

    const subtitle = isReady
        ? 'Install the update and restart to continue.'
        : downloading
          ? 'Downloading in the background…'
          : force
            ? 'This version is no longer supported. Please update to continue.'
            : 'Better performance and new features';

    const showLater = !force && !isReady && !downloading && variant === 'startup' && onLater;

    return (
        <div className="update-modal-overlay fade-in" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
            <div className="update-modal slide-up">
                <div className="update-modal__icon-wrap" aria-hidden>
                    <IconUpdate />
                </div>
                <h2 id="update-dialog-title" className="update-modal__title">
                    {title}
                </h2>
                <p className="update-modal__subtitle">{subtitle}</p>

                {errorMessage && (
                    <p className="update-modal__error" role="alert">
                        {errorMessage}
                    </p>
                )}

                {downloading && (
                    <div className="update-modal__progress" aria-live="polite">
                        <div
                            className="update-modal__progress-bar"
                            style={{ width: `${downloadPercent ?? 0}%` }}
                        />
                        <span className="update-modal__progress-label">
                            {downloadPercent != null ? `${downloadPercent}%` : 'Downloading…'}
                        </span>
                    </div>
                )}

                {!isReady && latestVersion && latestVersion !== currentVersion && (
                    <p className="update-modal__version-line">
                        v{currentVersion} → v{latestVersion}
                    </p>
                )}

                {releaseNotes.length > 0 && !downloading && (
                    <div className="update-modal__notes">
                        <p className="update-modal__notes-title">What&apos;s new</p>
                        <ul>
                            {releaseNotes.slice(0, 6).map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="update-modal__actions">
                    {isReady ? (
                        <button type="button" className="btn btn-primary btn-full" onClick={onInstallRestart}>
                            Install &amp; restart
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="btn btn-primary btn-full"
                                onClick={onUpdate}
                                disabled={downloading}
                            >
                                {downloading ? 'Downloading…' : 'Update now'}
                            </button>
                            {showLater && (
                                <button type="button" className="btn btn-secondary btn-full" onClick={onLater}>
                                    Later
                                </button>
                            )}
                        </>
                    )}
                    {errorMessage && onDismissError && (
                        <button type="button" className="btn btn-secondary btn-full" onClick={onDismissError}>
                            Dismiss
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function policyFromSnapshot(
    policy: AppVersionPolicyResponse | undefined
): { latestVersion?: string; releaseNotes: string[]; force: boolean } {
    return {
        latestVersion: policy?.latestVersion,
        releaseNotes: policy?.releaseNotes ?? [],
        force: policy?.forceUpdateRequired === true,
    };
}
