import type { PermissionKind } from '../../permissions/types';
import { PERMISSION_COPY } from '../../permissions/constants';

type Props = {
    kind: PermissionKind;
    onAllow: () => void;
    onSkip?: () => void;
    loading?: boolean;
};

const ICONS: Record<PermissionKind, string> = {
    microphone: '🎤',
    location: '📍',
};

export default function PermissionCard({ kind, onAllow, onSkip, loading }: Props) {
    const copy = PERMISSION_COPY[kind];

    return (
        <article className="permission-card scale-in">
            <div className="permission-card__icon" aria-hidden>
                {ICONS[kind]}
            </div>
            <h3 className="permission-card__title">{copy.title}</h3>
            <p className="permission-card__reason">{copy.reason}</p>
            <p className="permission-card__privacy">{copy.privacy}</p>
            <div className="permission-card__actions">
                <button
                    type="button"
                    className="btn btn-primary btn-full"
                    disabled={loading}
                    onClick={onAllow}
                >
                    {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : 'Allow'}
                </button>
                {onSkip ? (
                    <button type="button" className="btn btn-secondary btn-full" onClick={onSkip} disabled={loading}>
                        Skip for now
                    </button>
                ) : null}
            </div>
        </article>
    );
}
