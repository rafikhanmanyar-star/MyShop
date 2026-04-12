/**
 * PWA / install UX helpers for Safari vs Chrome and iPhone vs iPad.
 */

export function isStandaloneDisplayMode(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches;
}

/** iOS / iPadOS home-screen web app mode */
export function isIOSStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return 'standalone' in nav && !!nav.standalone;
}

export function isInstalledPWA(): boolean {
    return isStandaloneDisplayMode() || isIOSStandalone();
}

/**
 * True for iPhone, iPod, iPad (including iPadOS 13+ with desktop UA).
 */
export function isAppleTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipod/.test(ua)) return true;
    if (/ipad/.test(ua)) return true;
    // iPadOS 13+ may report as Macintosh + touch
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    return false;
}

export function isIPadLayout(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    if (/ipad/.test(ua)) return true;
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    return false;
}

/**
 * Instagram, Facebook, etc. often lack Add to Home Screen; user should open in Safari.
 */
export function isLikelyRestrictedInAppBrowser(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return (
        ua.includes('fban/') ||
        ua.includes('fbav') ||
        ua.includes('instagram') ||
        ua.includes('line/') ||
        ua.includes('tiktok') ||
        ua.includes('snapchat')
    );
}
