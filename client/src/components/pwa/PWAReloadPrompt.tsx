import { useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isWebClient } from '../../utils/pwaPlatform';

export default function PWAReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        registration.update();
        setInterval(() => registration.update(), 30 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('Service worker registration error:', error);
    },
  });

  useEffect(() => {
    const onCheck = () => {
      navigator.serviceWorker?.getRegistration?.()?.then((r) => r?.update?.());
    };
    window.addEventListener('pwa-check-update', onCheck);
    return () => window.removeEventListener('pwa-check-update', onCheck);
  }, []);

  if (!isWebClient() || !needRefresh) return null;

  return (
    <div className="fixed left-3 right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[10000] flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#4A90E2] to-[#357abd] p-4 text-white shadow-lg">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
        <RefreshCw className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Update available</p>
        <p className="text-xs opacity-90">Refresh to get the latest version</p>
      </div>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-[#4A90E2]"
      >
        Update
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
