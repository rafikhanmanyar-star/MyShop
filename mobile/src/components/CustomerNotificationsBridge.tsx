import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getApiBaseUrl } from '../api';
import { customerApi } from '../api';
import {
    appendOrderNotification,
    formatOrderEventMessage,
    makeOrderNotificationId,
    mergeBudgetAlerts,
} from '../services/customerNotifications';

/**
 * Keeps one EventSource open while logged in so order-related NOTIFY events
 * populate the notification inbox (bell).
 */
export default function CustomerNotificationsBridge() {
    const { shopSlug } = useParams();
    const { state } = useApp();
    const slug = shopSlug || state.shopSlug;
    const esRef = useRef<EventSource | null>(null);
    const budgetFetchedRef = useRef(false);

    useEffect(() => {
        if (!slug || !state.isLoggedIn) {
            budgetFetchedRef.current = false;
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }
            return;
        }

        if (!budgetFetchedRef.current) {
            budgetFetchedRef.current = true;
            void customerApi
                .getBudgetAlerts()
                .then((data: { alerts?: { type: string; message: string; severity: string }[]; month?: number; year?: number }) => {
                    const alerts = data.alerts || [];
                    const month = data.month ?? new Date().getMonth() + 1;
                    const year = data.year ?? new Date().getFullYear();
                    mergeBudgetAlerts(slug, alerts, month, year);
                })
                .catch(() => {
                    budgetFetchedRef.current = false;
                });
        }

        const token = localStorage.getItem('mobile_token');
        if (!token) return;

        const base = getApiBaseUrl();
        const qs = new URLSearchParams({ access_token: token });
        const url = `${base}/mobile/notifications/stream?${qs.toString()}`;

        const es = new EventSource(url);
        esRef.current = es;

        es.onmessage = (ev) => {
            try {
                const d = JSON.parse(ev.data);
                if (d.type !== 'order_event' || !d.payload) return;
                const p = d.payload as Record<string, unknown>;
                const { title, body } = formatOrderEventMessage(p);
                const id = makeOrderNotificationId(p, 'sse');
                appendOrderNotification(slug, {
                    id,
                    kind: 'order',
                    title,
                    body,
                    createdAt: new Date().toISOString(),
                    orderId: typeof p.orderId === 'string' ? p.orderId : String(p.orderId || ''),
                });
            } catch {
                /* ignore */
            }
        };

        es.onerror = () => {
            /* browser reconnects */
        };

        return () => {
            es.close();
            if (esRef.current === es) esRef.current = null;
        };
    }, [slug, state.isLoggedIn]);

    return null;
}
