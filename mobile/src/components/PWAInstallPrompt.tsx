import React, { useState, useEffect } from 'react';
import {
    isInstalledPWA,
    isAppleTouchDevice,
    isIPadLayout,
    isLikelyRestrictedInAppBrowser,
} from '../utils/pwaPlatform';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const PWAInstallPrompt: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSGuide, setShowIOSGuide] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [ipadLayout, setIpadLayout] = useState(false);
    const [inAppBrowser, setInAppBrowser] = useState(false);

    useEffect(() => {
        if (isInstalledPWA()) {
            setIsInstalled(true);
            return;
        }

        // Check if user dismissed before (check again after 7 days)
        const dismissed = localStorage.getItem('pwa_install_dismissed');
        if (dismissed) {
            const dismissedAt = parseInt(dismissed);
            const daysPassed = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
            if (daysPassed < 7) return;
        }

        const touchApple = isAppleTouchDevice();
        const restricted = isLikelyRestrictedInAppBrowser();
        setInAppBrowser(restricted);
        setIpadLayout(isIPadLayout());

        if (touchApple) {
            setIsIOS(true);
            const delayMs = restricted ? 1200 : 3000;
            setTimeout(() => setShowPrompt(true), delayMs);
        }

        // Listen for beforeinstallprompt (Android/Chrome)
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            // Show the install prompt after a short delay
            setTimeout(() => setShowPrompt(true), 2000);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // Listen for header "Install" click on iOS — show guide immediately
        const onShowIOSGuide = () => {
            setShowPrompt(true);
            setShowIOSGuide(true);
        };
        window.addEventListener('pwa-show-ios-guide', onShowIOSGuide);

        // Listen for successful install
        window.addEventListener('appinstalled', () => {
            setIsInstalled(true);
            setShowPrompt(false);
            setDeferredPrompt(null);
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('pwa-show-ios-guide', onShowIOSGuide);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setIsInstalled(true);
            }
        } catch (err) {
            console.error('Install prompt error:', err);
        }

        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        setShowIOSGuide(false);
        localStorage.setItem('pwa_install_dismissed', Date.now().toString());
    };

    if (isInstalled || !showPrompt) return null;

    // iOS installation guide
    if (isIOS) {
        return (
            <>
                {/* Backdrop */}
                {showIOSGuide && (
                    <div
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                            zIndex: 9998, animation: 'fadeIn 0.3s ease-out',
                        }}
                        onClick={handleDismiss}
                    />
                )}

                {/* iOS Guide Modal */}
                {showIOSGuide && (
                    <div style={{
                        position: 'fixed', bottom: 0, left: 0, right: 0,
                        background: 'white', borderRadius: '20px 20px 0 0',
                        padding: '28px 24px', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))',
                        zIndex: 9999, animation: 'slideUp 0.35s ease-out',
                        boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
                    }}>
                        <button onClick={handleDismiss} style={{
                            position: 'absolute', top: 16, right: 16,
                            width: 32, height: 32, borderRadius: '50%',
                            background: '#F1F5F9', border: 'none', fontSize: 18,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#64748B', cursor: 'pointer',
                        }}>✕</button>

                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 16,
                                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                                margin: '0 auto 16px', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: 28,
                            }}>🛒</div>
                            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Install MyShop</h3>
                            <p style={{ fontSize: 14, color: '#64748B' }}>Add to your home screen for the best experience</p>
                            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 8, lineHeight: 1.45 }}>
                                Use <strong style={{ color: '#475569' }}>Safari</strong> — “Add to Home Screen” is not available inside Instagram, Facebook, or some other in-app browsers.
                            </p>
                        </div>

                        {inAppBrowser && (
                            <div style={{
                                marginBottom: 20, padding: '12px 14px', borderRadius: 12,
                                background: '#FFF7ED', border: '1px solid #FDBA74', color: '#9A3412',
                                fontSize: 13, lineHeight: 1.5,
                            }}>
                                <strong>Open in Safari first.</strong> Tap the browser&apos;s menu (often <strong>···</strong> or <strong>Share</strong>), choose <strong>Open in Safari</strong>, then return here and tap <strong>Install</strong> again.
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12,
                                    background: '#EEF2FF', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: 20, flexShrink: 0,
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                                        <polyline points="16 6 12 2 8 6" />
                                        <line x1="12" y1="2" x2="12" y2="15" />
                                    </svg>
                                </div>
                                <div>
                                    <p style={{ fontSize: 14, fontWeight: 600 }}>
                                        Step 1: Tap the <span style={{ color: '#4F46E5' }}>Share</span> button
                                        {' '}
                                        <span style={{ fontWeight: 500, color: '#94A3B8' }}>(□↑)</span>
                                    </p>
                                    <p style={{ fontSize: 12, color: '#94A3B8' }}>
                                        {ipadLayout
                                            ? 'In Safari — usually in the top-right toolbar on iPad.'
                                            : 'In Safari — bottom toolbar on iPhone.'}
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12,
                                    background: '#EEF2FF', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: 20, flexShrink: 0,
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <line x1="12" y1="8" x2="12" y2="16" />
                                        <line x1="8" y1="12" x2="16" y2="12" />
                                    </svg>
                                </div>
                                <div>
                                    <p style={{ fontSize: 14, fontWeight: 600 }}>
                                        Step 2: Tap <span style={{ color: '#4F46E5' }}>"Add to Home Screen"</span>
                                    </p>
                                    <p style={{ fontSize: 12, color: '#94A3B8' }}>
                                        Scroll down in the share menu
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12,
                                    background: '#EEF2FF', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: 20, flexShrink: 0,
                                }}>✅</div>
                                <div>
                                    <p style={{ fontSize: 14, fontWeight: 600 }}>
                                        Step 3: Tap <span style={{ color: '#4F46E5' }}>"Add"</span>
                                    </p>
                                    <p style={{ fontSize: 12, color: '#94A3B8' }}>
                                        The app will appear on your home screen
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* iOS Banner */}
                {!showIOSGuide && (
                    <div style={{
                        position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom))',
                        left: 12, right: 12, background: 'white',
                        borderRadius: 16, padding: '14px 16px',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                        zIndex: 9999, animation: 'slideUp 0.35s ease-out',
                        display: 'flex', alignItems: 'center', gap: 12,
                        border: '1px solid rgba(79,70,229,0.1)',
                    }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, flexShrink: 0,
                        }}>🛒</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Install MyShop App</p>
                            <p style={{ fontSize: 11, color: '#94A3B8' }}>
                                {inAppBrowser ? 'Open in Safari, then add to Home Screen' : 'Add to home screen for quick access'}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowIOSGuide(true)}
                            style={{
                                padding: '8px 16px', borderRadius: 10,
                                background: '#4F46E5', color: 'white',
                                fontSize: 13, fontWeight: 600, border: 'none',
                                cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                        >
                            {inAppBrowser ? 'How to' : 'Install'}
                        </button>
                        <button
                            onClick={handleDismiss}
                            style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: '#F1F5F9', border: 'none',
                                fontSize: 14, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: '#94A3B8',
                                cursor: 'pointer', flexShrink: 0,
                            }}
                        >✕</button>
                    </div>
                )}
            </>
        );
    }

    // Android / Chrome install prompt
    return (
        <div style={{
            position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom))',
            left: 12, right: 12, background: 'white',
            borderRadius: 16, padding: '14px 16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            zIndex: 9999, animation: 'slideUp 0.35s ease-out',
            display: 'flex', alignItems: 'center', gap: 12,
            border: '1px solid rgba(79,70,229,0.1)',
        }}>
            <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
            }}>🛒</div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Install MyShop App</p>
                <p style={{ fontSize: 11, color: '#94A3B8' }}>Fast access • Works offline • No app store needed</p>
            </div>
            <button
                onClick={handleInstall}
                style={{
                    padding: '8px 16px', borderRadius: 10,
                    background: '#4F46E5', color: 'white',
                    fontSize: 13, fontWeight: 600, border: 'none',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                }}
            >
                Install
            </button>
            <button
                onClick={handleDismiss}
                style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: '#F1F5F9', border: 'none',
                    fontSize: 14, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#94A3B8',
                    cursor: 'pointer', flexShrink: 0,
                }}
            >✕</button>
        </div>
    );
};

export default PWAInstallPrompt;
