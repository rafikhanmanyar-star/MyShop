import { useState, useEffect } from 'react';
import { isAppleTouchDevice, isInstalledPWA, isWebClient } from '../utils/pwaPlatform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (!isWebClient()) return;

    if (isInstalledPWA()) {
      setIsInstalled(true);
      return;
    }

    if (isAppleTouchDevice()) {
      setIsIOS(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const canInstall = isWebClient() && !isInstalled && (!!deferredPrompt || isIOS);

  const promptInstall = async (): Promise<void> => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') setIsInstalled(true);
      } catch (err) {
        console.error('Install prompt error:', err);
      }
      setDeferredPrompt(null);
      return;
    }
    if (isIOS) {
      window.dispatchEvent(new CustomEvent('pwa-show-ios-guide'));
    }
  };

  return { canInstall, isInstalled, promptInstall, isIOS, hasNativePrompt: !!deferredPrompt };
}
