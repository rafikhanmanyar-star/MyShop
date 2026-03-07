import { useState, useEffect } from 'react';

/**
 * Returns current online status and updates when the browser goes online/offline.
 */
export function useOnline(): boolean {
    const [online, setOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return online;
}
