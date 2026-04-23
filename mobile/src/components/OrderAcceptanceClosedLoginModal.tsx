import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatOrderAcceptanceRange, isOrderAcceptanceClosedAt } from '../utils/orderAcceptanceHours';

const TICK_MS = 45_000;

/**
 * After login or registration, if ordering is currently closed, shows a one-time modal
 * so the customer notices before browsing (replaces the sticky banner for signed-in users).
 */
export default function OrderAcceptanceClosedLoginModal() {
    const { state } = useApp();
    const { settings, shop, isLoggedIn } = state;
    const [closed, setClosed] = useState(false);
    const [open, setOpen] = useState(false);
    const prevLoggedIn = useRef<boolean | null>(null);

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

    useEffect(() => {
        if (prevLoggedIn.current === null) {
            prevLoggedIn.current = isLoggedIn;
            return;
        }
        if (!prevLoggedIn.current && isLoggedIn && closed && settings) {
            setOpen(true);
        }
        prevLoggedIn.current = isLoggedIn;
    }, [isLoggedIn, closed, settings]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open || !settings || !closed) return null;

    const range = formatOrderAcceptanceRange(
        settings.order_acceptance_start || '09:00',
        settings.order_acceptance_end || '21:00'
    );
    const label = shop?.branchName?.trim()
        ? shop.branchName
        : (shop?.company_name || shop?.name || 'This shop');

    return (
        <div
            className="order-closed-login-modal__backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-closed-login-title"
            onClick={() => setOpen(false)}
        >
            <div
                className="order-closed-login-modal__panel"
                onClick={e => e.stopPropagation()}
            >
                <span className="order-closed-login-modal__icon" aria-hidden>⏰</span>
                <h2 id="order-closed-login-title" className="order-closed-login-modal__title">
                    <strong>{label}</strong> is closed.
                </h2>
                <p className="order-closed-login-modal__message">
                    You can place your order; it will be delivered after the shop opens.
                </p>
                {range ? (
                    <p className="order-closed-login-modal__hours">
                        Ordering hours: {range} (your local time).
                    </p>
                ) : null}
                <button
                    type="button"
                    className="order-closed-login-modal__ok"
                    onClick={() => setOpen(false)}
                >
                    OK
                </button>
            </div>
        </div>
    );
}
