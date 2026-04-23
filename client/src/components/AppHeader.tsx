import React, { useEffect, useRef, useState } from 'react';
import { Bell, KeyRound, Smartphone, User } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMobileOrders, type MobileOrderBellAlert } from '../context/MobileOrdersContext';
import { useInventoryPageHeaderPayload } from '../context/InventoryPageHeaderContext';
import { ICONS } from '../constants';
import ThemeToggle from './ui/ThemeToggle';

const MOBILE_ORDER_ROLES = ['admin', 'pos_cashier'];

/**
 * Bell, theme toggle, and signed-in user — reusable beside page-specific toolbar (e.g. POS strip).
 */
export function AppHeaderToolbar({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const { bellAlerts, dismissBellAlert, clearBellAlerts } = useMobileOrders();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const roleLabel = user?.role ? user.role.replace(/_/g, ' ') : '';
  const showMobileBell = !!(user && MOBILE_ORDER_ROLES.includes(user.role));
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

  const openBellAlert = (a: MobileOrderBellAlert) => {
    dismissBellAlert(a.orderId);
    setMenuOpen(false);
    if (a.alertType === 'password_reset') {
      if (isAdmin) {
        const id = a.loyaltyMemberId || a.customerId;
        if (id) {
          navigate(`/loyalty?tab=members&member=${encodeURIComponent(id)}`);
        } else {
          navigate('/loyalty?tab=members');
        }
      } else {
        navigate('/mobile-orders');
      }
      return;
    }
    navigate(`/mobile-orders?order=${encodeURIComponent(a.orderId)}`);
  };

  return (
    <div className={`flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3 ${className}`}>
      {showMobileBell && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-colors duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Shop notifications (mobile orders & password reset requests)"
            aria-label="Shop notifications"
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
                  Notifications
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
                    No new notifications
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {bellAlerts.map((a) => (
                      <li key={a.orderId}>
                        <button
                          type="button"
                          onClick={() => openBellAlert(a)}
                          className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/80"
                        >
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              a.alertType === 'password_reset'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300'
                            }`}
                          >
                            {a.alertType === 'password_reset' ? (
                              <KeyRound className="h-4 w-4" strokeWidth={2} />
                            ) : (
                              <Smartphone className="h-4 w-4" strokeWidth={2} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-gray-900 dark:text-gray-100">
                              {a.alertType === 'password_reset' ? 'Forgot password request' : a.orderNumber}
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              {a.alertType === 'password_reset' ? (
                                <>
                                  {a.orderNumber}
                                  {a.phoneHint ? ` · ends ${a.phoneHint}` : ''}
                                  {' · Open loyalty profile to reset app password'}
                                </>
                              ) : (
                                <>
                                  {a.status ? `${a.status}` : 'New order'}
                                  {a.grandTotal != null && Number.isFinite(a.grandTotal)
                                    ? ` · PKR ${a.grandTotal.toLocaleString()}`
                                    : ''}
                                </>
                              )}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400">
                            {a.alertType === 'password_reset' ? 'Profile' : 'Open'}
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
    </div>
  );
}

/**
 * Top app bar: mobile-order notifications (bell), theme toggle, signed-in user.
 * On `/inventory`, the page registers title, tabs, and New SKU here to save vertical space.
 */
export default function AppHeader({ className = '' }: { className?: string }) {
  const { pathname } = useLocation();
  const inventoryHeader = useInventoryPageHeaderPayload();

  if (pathname === '/inventory' && inventoryHeader) {
    const { activeTab, setActiveTab, onNewSku, tabs } = inventoryHeader;
    return (
      <header
        className={`mb-3 flex shrink-0 flex-col gap-3 border-b border-[#E5E7EB] pb-3 dark:border-gray-700 lg:flex-row lg:items-start lg:justify-between lg:gap-6 ${className}`}
      >
        <div className="min-w-0 shrink-0 lg:max-w-md">
          <h1 className="truncate text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-2xl">
            Inventory Management
          </h1>
          <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
            Enterprise-level stock control and analytics.
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-4xl xl:max-w-none">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-end xl:gap-4">
            <nav
              className="flex min-h-[2.5rem] min-w-0 flex-1 items-stretch gap-0 overflow-x-auto border-b border-[#E5E7EB] dark:border-slate-600"
              aria-label="Inventory sections"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors sm:text-sm ${
                      isActive
                        ? '-mb-px border-[#0047AB] text-[#0047AB] dark:border-[#5b8cff] dark:text-[#5b8cff]'
                        : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {React.cloneElement(tab.icon as React.ReactElement<{ width?: number; height?: number }>, {
                      width: 16,
                      height: 16,
                    })}
                    {tab.label}
                  </button>
                );
              })}
            </nav>
            <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={onNewSku}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0047AB] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#003694] dark:bg-[#0047AB] dark:hover:bg-[#003694]"
              >
                <span className="flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4" aria-hidden>
                  {ICONS.plus}
                </span>
                New SKU
              </button>
              <AppHeaderToolbar />
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className={`mb-6 flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-gray-200 pb-4 dark:border-gray-700 sm:gap-3 ${className}`}
    >
      <AppHeaderToolbar />
    </header>
  );
}
