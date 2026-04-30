import { useEffect, useState } from 'react';
import { useOnline } from '../hooks/useOnline';
import { getPendingOrderCount } from '../services/orderSyncStore';
import { getAllPendingProducts } from '../services/productSyncStore';

export default function OfflineBanner() {
    const online = useOnline();
    const [pendingOrders, setPendingOrders] = useState(0);
    const [pendingProducts, setPendingProducts] = useState(0);
    const [syncing, setSyncing] = useState(false);

    const refreshCounts = async () => {
        try {
            const [oc, prods] = await Promise.all([getPendingOrderCount(), getAllPendingProducts()]);
            setPendingOrders(oc);
            setPendingProducts(prods.length);
        } catch {
            /* ignore */
        }
    };

    useEffect(() => {
        void refreshCounts();
        const onPending = () => void refreshCounts();
        const onStart = () => setSyncing(true);
        const onDone = () => {
            setSyncing(false);
            void refreshCounts();
        };
        window.addEventListener('myshop:mobile-pending-changed', onPending);
        window.addEventListener('myshop:mobile-sync:start', onStart);
        window.addEventListener('myshop:mobile-sync:done', onDone);
        return () => {
            window.removeEventListener('myshop:mobile-pending-changed', onPending);
            window.removeEventListener('myshop:mobile-sync:start', onStart);
            window.removeEventListener('myshop:mobile-sync:done', onDone);
        };
    }, []);

    const pendingTotal = pendingOrders + pendingProducts;
    const showPendingBar = online && pendingTotal > 0 && !syncing;

    if (syncing) {
        return (
            <div className="offline-banner" style={{ background: '#0284c7', color: '#fff' }} role="status">
                Syncing pending orders and data…
            </div>
        );
    }

    if (!online) {
        return (
            <div className="offline-banner" role="status" aria-live="polite">
                You're offline. Browsing uses cached catalog where available. Orders and changes sync when you're back
                online
                {pendingTotal > 0 ? ` (${pendingTotal} pending)` : ''}.
            </div>
        );
    }

    if (showPendingBar) {
        return (
            <div className="offline-banner" style={{ background: '#0f766e', color: '#fff' }} role="status">
                {pendingTotal} item{pendingTotal === 1 ? '' : 's'} waiting to sync (orders / products).
            </div>
        );
    }

    return null;
}
