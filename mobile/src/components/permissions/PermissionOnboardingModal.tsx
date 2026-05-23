import { useCallback, useState } from 'react';
import { isNativeAndroid } from '../../services/firebaseNative';
import {
    isOnboardingComplete,
    markOnboardingComplete,
    requestLocationPermission,
    requestMicrophonePermission,
    PERMISSION_COPY,
} from '../../permissions';
import PermissionCard from './PermissionCard';

type Step = 'welcome' | 'microphone' | 'location' | 'done';

type Props = {
    onComplete: () => void;
};

/**
 * First-run permission onboarding for native Android.
 * Explains why permissions are needed before the system dialog appears.
 */
export default function PermissionOnboardingModal({ onComplete }: Props) {
    const [step, setStep] = useState<Step>('welcome');
    const [loading, setLoading] = useState(false);

    const finish = useCallback(() => {
        markOnboardingComplete();
        onComplete();
    }, [onComplete]);

    const handleMicAllow = async () => {
        setLoading(true);
        try {
            await requestMicrophonePermission();
        } finally {
            setLoading(false);
            setStep('location');
        }
    };

    const handleLocationAllow = async () => {
        setLoading(true);
        try {
            await requestLocationPermission();
        } finally {
            setLoading(false);
            finish();
        }
    };

    if (!isNativeAndroid() || isOnboardingComplete()) return null;

    return (
        <div className="permission-modal-overlay fade-in" role="dialog" aria-modal="true" aria-labelledby="perm-onboard-title">
            <div className="permission-modal slide-up">
                {step === 'welcome' && (
                    <>
                        <div className="permission-modal__hero">
                            <span className="permission-modal__emoji" aria-hidden>
                                🛡️
                            </span>
                            <h2 id="perm-onboard-title">{PERMISSION_COPY.welcome.title}</h2>
                            <p>{PERMISSION_COPY.welcome.subtitle}</p>
                        </div>
                        <ul className="permission-modal__list">
                            <li>
                                <strong>Microphone</strong> — voice orders &amp; hands-free search
                            </li>
                            <li>
                                <strong>Location</strong> — delivery range &amp; faster checkout
                            </li>
                        </ul>
                        <p className="permission-modal__privacy-note">
                            We only use these when you choose voice or GPS features. Your data stays with your shop order.
                        </p>
                        <div className="permission-modal__actions">
                            <button type="button" className="btn btn-primary btn-full" onClick={() => setStep('microphone')}>
                                Continue
                            </button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={finish}>
                                Skip for now
                            </button>
                        </div>
                    </>
                )}
                {step === 'microphone' && (
                    <PermissionCard kind="microphone" onAllow={() => void handleMicAllow()} onSkip={() => setStep('location')} loading={loading} />
                )}
                {step === 'location' && (
                    <PermissionCard kind="location" onAllow={() => void handleLocationAllow()} onSkip={finish} loading={loading} />
                )}
            </div>
        </div>
    );
}
