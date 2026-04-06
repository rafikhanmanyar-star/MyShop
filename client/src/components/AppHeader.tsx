import React, { useEffect, useRef, useState } from 'react';
import { Bell, Smartphone, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMobileOrders } from '../context/MobileOrdersContext';
import ThemeToggle from './ui/ThemeToggle';

const MOBILE_ORDER_ROLES = ['admin', 'pos_cashier'];

/**
 * Top app bar: mobile-order notifications (bell), theme toggle, signed-in user.
 * Uses design tokens so light/dark applies across the shell.
 */
export default function AppHeader({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { bellAlerts, dismissBellAlert, clearBellAlerts } = useMobileOrders();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const roleLabel = user?.role ? user.role.replace(/_/g, ' ') : '';
  const showMobileBell = user && MOBILE_ORDER_ROLES.includes(user.role);
  const badgeCount = showMobileBell ? bellAlerts.length : 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const openOrder = (orderId: string) => {
    dismissBellAlert(orderId);
    setMenuOpen(false);
    navigate(`/mobile-orders?order=${encodeURIComponent(orderId)}`);
  };

  return (
    <header
      className={`mb-6 flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-gray-200 pb-4 dark:border-gray-700 sm:gap-3 ${className}`}
    >
      {showMobileBell && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-colors duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Mobile order notifications"
            aria-label="Mobile order notifications"
            aria-expanded={menuOpen ? 'true' : 'false'}
            aria-haspopup="dialog"
          >
            <Bell className="h-5 w-5" strokeWidth={2} />
            {badgeCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-900"
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Mobile orders
                </span>
                {bellAlerts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearBellAlerts();
                      setMenuOpen(false);
                    }}
                    className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-[min(60vh,20rem)] overflow-y-auto">
                {bellAlerts.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    No new mobile order alerts
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {bellAlerts.map((a) => (
                      <li key={a.orderId}>
                        <button
                          type="button"
                          onClick={() => openOrder(a.orderId)}
                          className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/80"
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                            <Smartphone className="h-4 w-4" strokeWidth={2} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-gray-900 dark:text-gray-100">
                              {a.orderNumber}
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              {a.status ? `${a.status}` : 'New order'}
                              {a.grandTotal != null && Number.isFinite(a.grandTotal)
                                ? ` · PKR ${a.grandTotal.toLocaleString()}`
                                : ''}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400">
                            Open
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-700">
                <Link
                  to="/mobile-orders"
                  className="block text-center text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
                  onClick={() => setMenuOpen(false)}
                >
                  View all mobile orders
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      <ThemeToggle />

      {user && (
        <div className="flex min-w-0 max-w-[min(100%,16rem)] items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-card dark:border-gray-700 dark:bg-gray-800 sm:max-w-xs sm:px-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-700/25 dark:text-primary-300"
            aria-hidden
          >
            <User className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="min-w-0 text-left">
            <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{roleLabel}</p>
          </div>
        </div>
      )}
    </header>
  );
}
