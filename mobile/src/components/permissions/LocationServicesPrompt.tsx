import type { ReactNode } from 'react';
import { useState } from 'react';
import { PERMISSION_COPY } from '../../permissions/constants';
import { requestLocationPermission } from '../../permissions/locationPermission';
import { openAppSettings } from '../../permissions/permissionService';

type Props = {
    children: ReactNode;
    onProceed: () => void;
    loading?: boolean;
};

/** Pre-system-dialog rationale for location (Google Play disclosure). */
export default function LocationRationaleModal({ children, onProceed, loading }: Props) {
    const [open, setOpen] = useState(false);

    const handleAllow = async () => {
        await requestLocationPermission();
        setOpen(false);
        onProceed();
    };

    return (
        <>
            <div onClick={() => setOpen(true)} role="presentation">
                {children}
            </div>
            {open ? (
                <div className="permission-modal-overlay fade-in" role="dialog" aria-modal="true">
                    <div className="permission-modal slide-up">
                        <h3>{PERMISSION_COPY.location.title}</h3>
                        <p>{PERMISSION_COPY.location.reason}</p>
                        <p className="permission-modal__privacy-note">{PERMISSION_COPY.location.privacy}</p>
                        <div className="permission-modal__actions">
                            <button type="button" className="btn btn-primary btn-full" disabled={loading} onClick={() => void handleAllow()}>
                                {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : 'Continue'}
                            </button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

export function LocationServicesPrompt({ onOpenSettings }: { onOpenSettings?: () => void }) {
    return (
        <div className="permission-denied permission-denied--compact fade-in" role="alert">
            <p className="permission-denied__text">{PERMISSION_COPY.location.gpsDisabled}</p>
            <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => (onOpenSettings ? onOpenSettings() : void openAppSettings())}
            >
                Open Settings
            </button>
        </div>
    );
}
