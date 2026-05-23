import { useMicrophonePermission, useLocationPermission } from '../../permissions/permissionHooks';
import { openAppSettings } from '../../permissions/permissionService';
import type { PermissionStatus } from '../../permissions/types';

function statusLabel(status: PermissionStatus): string {
    switch (status) {
        case 'granted':
            return 'Allowed';
        case 'denied':
            return 'Denied';
        case 'permanently_denied':
            return 'Blocked — open Settings';
        case 'unavailable':
            return 'Not available';
        case 'prompt':
            return 'Not asked yet';
        default:
            return 'Checking…';
    }
}

function statusClass(status: PermissionStatus): string {
    if (status === 'granted') return 'permission-status__badge--ok';
    if (status === 'permanently_denied' || status === 'denied') return 'permission-status__badge--bad';
    return 'permission-status__badge--neutral';
}

type RowProps = {
    title: string;
    icon: string;
    status: PermissionStatus;
    loading: boolean;
    onRequest: () => void;
};

function PermissionRow({ title, icon, status, loading, onRequest }: RowProps) {
    return (
        <div className="permission-status__row">
            <span className="permission-status__icon" aria-hidden>
                {icon}
            </span>
            <div className="permission-status__info">
                <span className="permission-status__title">{title}</span>
                <span className={`permission-status__badge ${statusClass(status)}`}>{loading ? '…' : statusLabel(status)}</span>
            </div>
            {status !== 'granted' && status !== 'unavailable' ? (
                <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={onRequest}>
                    {status === 'permanently_denied' ? 'Settings' : 'Allow'}
                </button>
            ) : null}
        </div>
    );
}

/** Account settings section — permission troubleshooting. */
export default function PermissionStatusSection() {
    const mic = useMicrophonePermission();
    const loc = useLocationPermission();

    const handleMic = async () => {
        if (mic.status === 'permanently_denied') {
            await openAppSettings();
            return;
        }
        await mic.request();
    };

    const handleLoc = async () => {
        if (loc.status === 'permanently_denied') {
            await openAppSettings();
            return;
        }
        await loc.request();
    };

    return (
        <section className="permission-status" aria-labelledby="perm-status-heading">
            <h2 id="perm-status-heading" style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                App permissions
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Manage microphone and location access for voice orders and delivery.
            </p>
            <PermissionRow title="Microphone" icon="🎤" status={mic.status} loading={mic.loading} onRequest={() => void handleMic()} />
            <PermissionRow title="Location" icon="📍" status={loc.status} loading={loc.loading} onRequest={() => void handleLoc()} />
            <button
                type="button"
                className="btn btn-secondary btn-full"
                style={{ marginTop: 12, fontSize: 13 }}
                onClick={() => void openAppSettings()}
            >
                Open system app settings
            </button>
        </section>
    );
}
