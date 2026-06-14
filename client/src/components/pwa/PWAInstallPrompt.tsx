import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import {
  isAppleTouchDevice,
  isInstalledPWA,
  isIPadLayout,
  isLikelyRestrictedInAppBrowser,
  isWebClient,
} from '../../utils/pwaPlatform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'myshop_pwa_install_dismissed';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [ipadLayout, setIpadLayout] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState(false);

  useEffect(() => {
    if (!isWebClient()) return;

    if (isInstalledPWA()) {
      setIsInstalled(true);
      return;
    }

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const daysPassed = (Date.now() - parseInt(dismissed, 10)) / (1000 * 60 * 60 * 24);
      if (daysPassed < 7) return;
    }

    const touchApple = isAppleTouchDevice();
    setInAppBrowser(isLikelyRestrictedInAppBrowser());
    setIpadLayout(isIPadLayout());
    if (touchApple) setIsIOS(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowPrompt(true), 2000);
    };

    const onShowIOSGuide = () => {
      setShowPrompt(true);
      setShowIOSGuide(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('pwa-show-ios-guide', onShowIOSGuide);
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
      if (outcome === 'accepted') setIsInstalled(true);
    } catch (err) {
      console.error('Install prompt error:', err);
    }
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  if (!isWebClient() || isInstalled || !showPrompt) return null;

  if (isIOS) {
    if (!showIOSGuide) return null;

    return (
      <>
        <div
          className="fixed inset-0 z-[9998] bg-black/50"
          onClick={handleDismiss}
          aria-hidden
        />
        <div className="fixed bottom-0 left-0 right-0 z-[9999] rounded-t-2xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.15)] dark:bg-card">
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4A90E2] to-[#357abd] text-2xl text-white shadow-sm">
              🛍️
            </div>
            <h3 className="text-lg font-bold text-[#212529] dark:text-foreground">Install MyShop</h3>
            <p className="mt-1 text-sm text-[#6C757D] dark:text-muted-foreground">
              Add to your home screen for quick access
            </p>
          </div>

          {inAppBrowser && (
            <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm leading-snug text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-200">
              <strong>Open in Safari first.</strong> In-app browsers (Instagram, Facebook, etc.) do not support Add to Home Screen.
            </div>
          )}

          <ol className="space-y-5">
            <li className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4A90E2]/10 text-[#4A90E2]">
                <Share className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#212529] dark:text-foreground">
                  Tap Share <span className="text-[#6C757D]">(□↑)</span>
                </p>
                <p className="text-xs text-[#6C757D] dark:text-muted-foreground">
                  {ipadLayout ? 'Top toolbar in Safari on iPad' : 'Bottom toolbar in Safari on iPhone'}
                </p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4A90E2]/10 text-[#4A90E2]">
                <PlusSquare className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#212529] dark:text-foreground">
                  Tap &quot;Add to Home Screen&quot;
                </p>
                <p className="text-xs text-[#6C757D] dark:text-muted-foreground">Scroll down in the share menu</p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4A90E2]/10 text-[#4A90E2]">
                ✅
              </span>
              <div>
                <p className="text-sm font-semibold text-[#212529] dark:text-foreground">Tap &quot;Add&quot;</p>
                <p className="text-xs text-[#6C757D] dark:text-muted-foreground">MyShop will appear on your home screen</p>
              </div>
            </li>
          </ol>
        </div>
      </>
    );
  }

  if (!deferredPrompt) return null;

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[9999] flex items-center gap-3 rounded-2xl border border-[#4A90E2]/15 bg-white p-3.5 shadow-lg dark:border-[#4A90E2]/25 dark:bg-card">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4A90E2] to-[#357abd] text-xl text-white">
        🛍️
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#212529] dark:text-foreground">Install MyShop</p>
        <p className="text-[0.65rem] text-[#6C757D] dark:text-muted-foreground">
          Fast access · Works offline · No app store
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#4A90E2] px-3.5 py-2 text-xs font-semibold text-white active:scale-95"
      >
        <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
        Install
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
