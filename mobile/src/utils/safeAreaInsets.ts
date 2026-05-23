import { Capacitor } from '@capacitor/core';

const ANDROID_STATUS_BAR_FALLBACK_PX = 28;

function readEnvSafeAreaInsetTop(): number {
    if (typeof document === 'undefined') return 0;

    const probe = document.createElement('div');
    probe.style.cssText =
        'position:fixed;top:0;left:0;padding-top:constant(safe-area-inset-top);padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none;';
    document.documentElement.appendChild(probe);
    const inset = parseInt(getComputedStyle(probe).paddingTop, 10) || 0;
    probe.remove();
    return inset;
}

function resolveSafeTop(): string {
    const envTop = readEnvSafeAreaInsetTop();
    if (envTop > 0) return `${envTop}px`;

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        return `${ANDROID_STATUS_BAR_FALLBACK_PX}px`;
    }

    return 'env(safe-area-inset-top, 0px)';
}

/** Applies top safe-area inset for native shells where env() is often zero on Android. */
export function applySafeAreaInsets(): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    if (Capacitor.isNativePlatform()) {
        root.classList.add('capacitor-native', `platform-${Capacitor.getPlatform()}`);
    }

    const apply = () => {
        root.style.setProperty('--safe-top', resolveSafeTop());
    };

    apply();
    window.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('resize', apply);
}
