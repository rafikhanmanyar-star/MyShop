import type { PermissionKind } from '../../permissions/types';
import { shouldShowOpenSettings } from '../../permissions/permissionHooks';
import type { PermissionStatus } from '../../permissions/types';

type Props = {
    kind: PermissionKind;
    status: PermissionStatus;
    message?: string;
    onRetry: () => void;
    onOpenSettings: () => void;
    /** Shown when GPS / location services are disabled at OS level. */
    gpsDisabled?: boolean;
    compact?: boolean;
};

export default function PermissionDeniedBanner({
    kind,
    status,
    message,
    onRetry,
    onOpenSettings,
    gpsDisabled,
    compact,
}: Props) {
    if (status === 'granted' || status === 'unknown' || status === 'prompt') return null;

    const showSettings = shouldShowOpenSettings(status) || gpsDisabled;

    return (
        <div className={`permission-denied fade-in ${compact ? 'permission-denied--compact' : ''}`} role="alert">
            <p className="permission-denied__text">
                {gpsDisabled
                    ? 'Location services are off. Enable GPS in your device settings, then try again.'
                    : message ?? `Permission required for this feature.`}
            </p>
            <div className="permission-denied__actions">
                {!gpsDisabled && status !== 'permanently_denied' ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
                        Try again
                    </button>
                ) : null}
                {showSettings ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={onOpenSettings}>
                        Open Settings
                    </button>
                ) : null}
            </div>
            {kind === 'microphone' && (
                <p className="permission-denied__fallback">You can still type your search or order manually.</p>
            )}
            {kind === 'location' && (
                <p className="permission-denied__fallback">Use the map pin or enter your address instead.</p>
            )}
        </div>
    );
}
