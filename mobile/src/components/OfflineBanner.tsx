import { useOnline } from '../hooks/useOnline';

export default function OfflineBanner() {
    const online = useOnline();
    if (online) return null;
    return (
        <div className="offline-banner" role="status" aria-live="polite">
            You're offline. Some features need a connection. Orders will sync when you're back online.
        </div>
    );
}
