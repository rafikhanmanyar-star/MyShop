import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getApiBaseUrl } from '../api';

const HEARTBEAT_INTERVAL_MS = 30_000;

function pageLabelFromPath(pathname: string): string {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length <= 1) return 'home';
    const segment = parts[parts.length - 1];
    if (segment === 'products') return 'browsing_products';
    if (parts[parts.length - 2] === 'products') return 'viewing_product';
    if (segment === 'cart') return 'viewing_cart';
    if (segment === 'checkout') return 'checkout';
    if (segment === 'offers') return 'browsing_offers';
    if (parts[parts.length - 2] === 'offers') return 'viewing_offer';
    if (segment === 'orders') return 'viewing_orders';
    if (parts.includes('orders') && parts.includes('track')) return 'tracking_order';
    if (parts[parts.length - 2] === 'orders') return 'viewing_order';
    if (segment === 'account') return 'account_settings';
    if (segment === 'budget') return 'budget';
    if (segment === 'notifications') return 'notifications';
    return segment;
}

export function useHeartbeat() {
    const { state, cartCount, cartTotal } = useApp();
    const location = useLocation();
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!state.isLoggedIn) return;

        const token = localStorage.getItem('mobile_token');
        if (!token) return;

        const send = () => {
            const currentPage = pageLabelFromPath(location.pathname);
            fetch(`${getApiBaseUrl()}/mobile/heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    currentPage,
                    cartItemCount: cartCount,
                    cartTotal,
                }),
            }).catch(() => {});
        };

        send();
        timerRef.current = setInterval(send, HEARTBEAT_INTERVAL_MS);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [state.isLoggedIn, location.pathname, cartCount, cartTotal]);
}
