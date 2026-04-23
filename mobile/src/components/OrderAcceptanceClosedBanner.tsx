import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatOrderAcceptanceRange, isOrderAcceptanceClosedAt } from '../utils/orderAcceptanceHours';

const TICK_MS = 45_000;

/**
 * Shown when current time is outside Orders from / Orders until (POS → Settings → Mobile branding → Ordering settings).
 */
export default function OrderAcceptanceClosedBanner() {
    const { state } = useApp();
    const { settings, shop } = state;
    const [closed, setClosed] = useState(false);

    useEffect(() => {
        if (!settings) {
            setClosed(false);
            return;
        }
        const start = settings.order_acceptance_start || '09:00';
        const end = settings.order_acceptance_end || '21:00';

        const tick = () => {
            setClosed(isOrderAcceptanceClosedAt(start, end, new Date()));
        };
        tick();
        const id = window.setInterval(tick, TICK_MS);
        return () => window.clearInterval(id);
    }, [settings]);

    if (!settings || !closed) return null;

    const range = formatOrderAcceptanceRange(
        settings.order_acceptance_start || '09:00',
        settings.order_acceptance_end || '21:00'
    );
    const label = shop?.branchName?.trim()
        ? shop.branchName
        : (shop?.company_name || shop?.name || 'This shop');

    return (
        <div
            className="order-closed-banner"
            role="alert"
            aria-live="assertive"
        >
            <span className="order-closed-banner__icon" aria-hidden>⏰</span>
            <div className="order-closed-banner__text">
                <p className="order-closed-banner__lead">
                    <strong>{label}</strong> is closed.
                </p>
                <p className="order-closed-banner__message">
                    You can place your order; it will be delivered after the shop opens.
                </p>
                {range ? (
                    <span className="order-closed-banner__sub">
                        Ordering hours: {range} (your local time).
                    </span>
                ) : null}
            </div>
        </div>
    );
}
