import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';
import {
    getNotifications,
    mergeBudgetAlerts,
    markAllRead,
    markRead,
    clearAll,
    subscribeCustomerNotifications,
    type CustomerNotificationItem,
} from '../services/customerNotifications';

export default function NotificationsPage() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state } = useApp();
    const slug = shopSlug || state.shopSlug || '';
    const [listVersion, setListVersion] = useState(0);
    const [budgetLoading, setBudgetLoading] = useState(false);

    useEffect(() => {
        return subscribeCustomerNotifications(() => setListVersion((n) => n + 1));
    }, []);

    useEffect(() => {
        if (!state.isLoggedIn || !slug) return;
        setBudgetLoading(true);
        customerApi
            .getBudgetAlerts()
            .then((data: { alerts?: { type: string; message: string; severity: string }[]; month?: number; year?: number }) => {
                const alerts = data.alerts || [];
                const month = data.month ?? new Date().getMonth() + 1;
                const year = data.year ?? new Date().getFullYear();
                mergeBudgetAlerts(slug, alerts, month, year);
                markAllRead(slug);
                setListVersion((n) => n + 1);
            })
            .catch(() => {
                setListVersion((n) => n + 1);
            })
            .finally(() => setBudgetLoading(false));
    }, [state.isLoggedIn, slug]);

    const items = useMemo(() => (slug ? getNotifications(slug) : []), [slug, listVersion]);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=notifications`, { replace: true });
        }
    }, [state.isLoggedIn, navigate, shopSlug]);

    const onOrderClick = (n: CustomerNotificationItem) => {
        if (!slug || n.kind !== 'order' || !n.orderId) return;
        markRead(slug, n.id);
        setListVersion((x) => x + 1);
        navigate(`/${slug}/orders/${n.orderId}`);
    };

    if (!state.isLoggedIn) {
        return (
            <div className="notifications-page fade-in">
                <p className="notifications-loading">Redirecting…</p>
            </div>
        );
    }

    return (
        <div className="notifications-page fade-in">
            <div className="notifications-page-header">
                <Link to={`/${slug}`} className="notifications-back" aria-label="Back">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </Link>
                <h1 className="notifications-title">Notifications</h1>
                {items.length > 0 && (
                    <button type="button" className="notifications-clear" onClick={() => { clearAll(slug); setListVersion((x) => x + 1); }}>
                        Clear all
                    </button>
                )}
            </div>

            {budgetLoading && <p className="notifications-hint">Loading reminders…</p>}

            {items.length === 0 && !budgetLoading ? (
                <div className="notifications-empty">
                    <div className="notifications-empty-icon" aria-hidden>
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </svg>
                    </div>
                    <p className="notifications-empty-title">You&apos;re all caught up</p>
                    <p className="notifications-empty-text">Order updates and budget reminders will appear here.</p>
                </div>
            ) : (
                <ul className="notifications-list">
                    {items.map((n) => (
                        <li key={n.id}>
                            {n.kind === 'order' && n.orderId ? (
                                <button type="button" className="notifications-item notifications-item--order" onClick={() => onOrderClick(n)}>
                                    <span className={`notifications-dot ${!n.read ? 'notifications-dot--unread' : ''}`} aria-hidden />
                                    <div className="notifications-item-body">
                                        <span className="notifications-item-title">{n.title}</span>
                                        <span className="notifications-item-text">{n.body}</span>
                                        <time className="notifications-item-time" dateTime={n.createdAt}>
                                            {new Date(n.createdAt).toLocaleString(undefined, {
                                                dateStyle: 'medium',
                                                timeStyle: 'short',
                                            })}
                                        </time>
                                    </div>
                                    <span className="notifications-item-chevron" aria-hidden>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M9 18l6-6-6-6" />
                                        </svg>
                                    </span>
                                </button>
                            ) : (
                                <div className="notifications-item notifications-item--static">
                                    <span className={`notifications-dot ${!n.read ? 'notifications-dot--unread' : ''}`} aria-hidden />
                                    <div className="notifications-item-body">
                                        <span className="notifications-item-title">{n.title}</span>
                                        <span className="notifications-item-text">{n.body}</span>
                                        <time className="notifications-item-time" dateTime={n.createdAt}>
                                            {new Date(n.createdAt).toLocaleString(undefined, {
                                                dateStyle: 'medium',
                                                timeStyle: 'short',
                                            })}
                                        </time>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
