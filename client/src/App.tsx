import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { installElectronFocusRecovery } from './utils/electronFocusRecovery';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { ShiftsProvider } from './context/ShiftsContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './components/shop/SettingsPage';
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, Building2,
  BarChart3, BookOpen, Settings, Store, Smartphone, Brain, ChevronRight, ChevronDown, ChevronUp, Wallet, ClipboardList, Receipt, Undo2, Tag, AlignJustify, Clock, LogOut, User
} from 'lucide-react';
import { BranchProvider } from './context/BranchContext';
import { ConnectivityProvider } from './context/ConnectivityContext';
import { MobileOrdersProvider } from './context/MobileOrdersContext';
import { SyncOnOnline } from './components/SyncOnOnline';
import OfflineBanner from './components/OfflineBanner';
import AppHeader from './components/AppHeader';
import { InventoryPageHeaderProvider } from './context/InventoryPageHeaderContext';
import { useAutoLogout } from './hooks/useAutoLogout';

const POSSalesPage = lazy(() => import('./components/shop/POSSalesPage'));
const InventoryPage = lazy(() => import('./components/shop/InventoryPage'));
const ProcurementPage = lazy(() => import('./components/shop/ProcurementPage'));
const LoyaltyPage = lazy(() => import('./components/shop/LoyaltyPage'));
const MultiStorePage = lazy(() => import('./components/shop/MultiStorePage'));
const BIDashboardsPage = lazy(() => import('./components/shop/BIDashboardsPage'));
const AccountingPage = lazy(() => import('./components/shop/AccountingPage'));
const DailyReportPage = lazy(() => import('./components/shop/accounting/DailyReportPage'));
const ExpensePage = lazy(() => import('./components/shop/expenses/ExpensePage'));
const MobileOrdersPage = lazy(() => import('./components/shop/MobileOrdersPage'));
const OffersPage = lazy(() => import('./components/shop/OffersPage'));
const ForecastPage = lazy(() => import('./components/shop/ForecastPage'));
const CashierDashboardPage = lazy(() => import('./components/shop/cashier/CashierDashboardPage'));
const ShiftsAdminPage = lazy(() => import('./components/shop/cashier/ShiftsAdminPage'));
const KhataPage = lazy(() => import('./components/shop/khata/KhataPage'));
const SalesReturnListPage = lazy(() => import('./components/shop/salesReturns/SalesReturnListPage'));
const SalesReturnCreatePage = lazy(() => import('./components/shop/salesReturns/SalesReturnCreatePage'));
const SalesReturnDetailPage = lazy(() => import('./components/shop/salesReturns/SalesReturnDetailPage'));
const ShopRealtimeBridge = lazy(() => import('./components/shop/ShopRealtimeBridge'));

type NavItem = {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  /** Optional tooltip (e.g. merged dashboard description). */
  title?: string;
};
type NavSection = { section: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    section: 'MAIN',
    items: [
      {
        path: '/',
        label: 'Dashboard',
        title: 'Daily report + business overview (KPIs, trends, alerts)',
        icon: LayoutDashboard,
        roles: ['admin', 'accountant'],
      },
      { path: '/cashier-dashboard', label: 'Cashier Dashboard', icon: ClipboardList, roles: ['pos_cashier'] },
      { path: '/pos', label: 'POS', icon: ShoppingCart, roles: ['admin', 'pos_cashier'] },
      { path: '/sales-returns', label: 'Sales Return', icon: Undo2, roles: ['admin', 'pos_cashier', 'accountant'] },
      { path: '/mobile-orders', label: 'Mobile Orders', icon: Smartphone, roles: ['admin', 'pos_cashier'] },
      { path: '/offers', label: 'Offers', icon: Tag, roles: ['admin'] },
    ],
  },
  {
    section: 'OPERATIONS',
    items: [
      { path: '/inventory', label: 'Inventory', icon: Package, roles: ['admin'] },
      { path: '/procurement', label: 'Procurement', icon: Truck, roles: ['admin', 'accountant'] },
    ],
  },
  {
    section: 'CUSTOMERS',
    items: [
      { path: '/loyalty', label: 'Loyalty', icon: Users, roles: ['admin'] },
      { path: '/khata', label: 'Khata Ledger', icon: Receipt, roles: ['admin', 'pos_cashier', 'accountant'] },
    ],
  },
  {
    section: 'BUSINESS',
    items: [
      { path: '/multi-store', label: 'Multi-Store', icon: Building2, roles: ['admin'] },
      { path: '/shifts', label: 'Shifts', icon: Clock, roles: ['admin', 'accountant'] },
      { path: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'accountant'] },
      { path: '/accounting', label: 'Accounting', icon: BookOpen, roles: ['admin', 'accountant'] },
      { path: '/expenses', label: 'Expenses', icon: Wallet, roles: ['admin', 'accountant'] },
      { path: '/forecast', label: 'Forecasting', icon: Brain, roles: ['admin', 'accountant'] },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'accountant', 'pos_cashier'] },
    ],
  },
];

const navItems = navSections.flatMap(s => s.items);

function getUserInitials(name: string) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function Sidebar({ collapsed, onToggle, onLogout }: { collapsed: boolean; onToggle: () => void; onLogout: () => void }) {
  const { user } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userMenuOpen]);

  const filteredSections = navSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => !user || !item.roles || item.roles.includes(user.role)),
    }))
    .filter(section => section.items.length > 0);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-white/10 bg-[#0056b3] shadow-sm transition-all duration-300 ease-in-out ${collapsed ? 'w-20' : 'w-72'}`}
    >
      {/* Header: Logo + Toggle — same brand blue as POS category chips */}
      <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 bg-[#0056b3] px-5">
        {!collapsed && (
          <div className="group flex cursor-pointer items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 shadow-md transition-transform duration-200 group-hover:scale-105">
              <Store className="h-[1.125rem] w-[1.125rem] text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold leading-none tracking-tight text-white">MyShop</span>
              <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-blue-200/80">The Digital Atelier</span>
            </div>
          </div>
        )}
        {collapsed && (
          <button
            onClick={onToggle}
            className="group flex w-full items-center justify-center rounded-lg py-3 text-blue-100 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            title="Open sidebar"
          >
            <ChevronRight className="h-6 w-6 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg p-1.5 text-blue-200 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <AlignJustify className="h-[1.125rem] w-[1.125rem]" />
          </button>
        )}
      </div>

      {/* Navigation with section groups */}
      <nav className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#0056b3] px-3 pt-1 pb-2">
        {filteredSections.map((section, idx) => (
          <div key={section.section} className={idx > 0 ? 'mt-5' : ''}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-blue-200/90">
                {section.section}
              </p>
            )}
            {collapsed && idx > 0 && (
              <div className="mx-auto my-2 h-px w-8 bg-white/25" />
            )}
            <div className="space-y-0.5">
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  title={item.title ?? item.label}
                  className={({ isActive }) =>
                    `nav-sidebar-link group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200
                    ${isActive
                      ? 'bg-white/20 font-semibold text-white shadow-sm'
                      : 'font-medium text-blue-100 hover:bg-white/10 hover:text-white'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-white" />
                      )}
                      <item.icon
                        className={`h-[1.125rem] w-[1.125rem] flex-shrink-0 ${collapsed ? 'mx-auto' : ''} ${isActive ? 'text-white' : 'text-blue-200'}`}
                      />
                      {!collapsed && <span>{item.label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User card at bottom */}
      <div className="mt-auto shrink-0 border-t border-white/10 bg-[#0056b3] p-3" ref={menuRef}>
        <div className="relative">
          {/* Dropdown menu (opens upward) */}
          {userMenuOpen && user && (
            <div
              className={`absolute bottom-full mb-2 overflow-hidden rounded-xl border border-sky-200/90 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800 ${collapsed ? 'left-1/2 -translate-x-1/2 w-48' : 'left-0 right-0'}`}
            >
              <div className="p-1.5">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}

          {/* User card (clickable) */}
          {!collapsed && user ? (
            <button
              type="button"
              onClick={() => setUserMenuOpen(prev => !prev)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 transition-colors duration-150 hover:bg-white/15"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/25 text-xs font-bold text-white ring-1 ring-white/20">
                {getUserInitials(user.name)}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                <p className="text-xs text-blue-200/90 capitalize">{user.role.replace(/_/g, ' ')}</p>
              </div>
              {userMenuOpen
                ? <ChevronUp className="h-4 w-4 shrink-0 text-blue-200" />
                : <ChevronDown className="h-4 w-4 shrink-0 text-blue-200" />
              }
            </button>
          ) : collapsed && user ? (
            <button
              type="button"
              onClick={() => setUserMenuOpen(prev => !prev)}
              className="flex w-full flex-col items-center gap-2 rounded-lg py-1 transition-colors duration-150 hover:bg-sky-200/60 dark:hover:bg-sky-800/40"
              title={`${user.name} — Click to log out`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                {getUserInitials(user.name)}
              </div>
            </button>
          ) : null}
        </div>

        {!collapsed && (
          <p className="mt-2 text-center text-xs text-blue-200/70">
            v{__APP_VERSION__}
          </p>
        )}
        {collapsed && (
          <p className="mt-2 text-center text-xs text-blue-200/70">v{__APP_VERSION__}</p>
        )}
      </div>
    </aside>
  );
}

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [posFullScreen, setPosFullScreen] = useState(false);
  const { pathname } = useLocation();
  const isPosRoute = pathname === '/pos';
  const isMobileOrdersRoute = pathname === '/mobile-orders';
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || 'pos_cashier';

  useAutoLogout(isAuthenticated, useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]));
  useEffect(() => {
    const handlePosFullScreen = (e: CustomEvent<{ enabled: boolean }>) => {
      setPosFullScreen(!!e.detail?.enabled);
    };
    window.addEventListener('pos:fullscreen', handlePosFullScreen as EventListener);
    return () => window.removeEventListener('pos:fullscreen', handlePosFullScreen as EventListener);
  }, []);

  useEffect(() => installElectronFocusRecovery(), []);

  return (
    <BranchProvider>
      <ConnectivityProvider>
      <AppProvider>
        <ShiftsProvider>
          <MobileOrdersProvider>
          <InventoryPageHeaderProvider>
          <SyncOnOnline />
          <Suspense fallback={null}>
            <ShopRealtimeBridge />
          </Suspense>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        {!posFullScreen && <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={() => { logout(); navigate('/'); }} />}
        <main className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden transition-all duration-300 ease-in-out ${posFullScreen ? 'ml-0' : sidebarCollapsed ? 'ml-20' : 'ml-72'}`}>
          <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden page-container ${isMobileOrdersRoute ? 'overflow-y-hidden' : 'overflow-y-auto'}`}>
          {!posFullScreen && !isPosRoute && <AppHeader />}
          <OfflineBanner />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Suspense fallback={
            <div className="flex min-h-[60vh] items-center justify-center">
              <div className="relative h-12 w-12">
                <div className="absolute inset-0 rounded-full border-4 border-primary-100 dark:border-gray-700"></div>
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
              </div>
            </div>
          }>
            <div className="flex-1 min-h-0 flex flex-col">
            <Routes>
              {/* Redirect pos_cashier to Cashier Dashboard if they try to access / */}
              <Route path="/" element={role === 'pos_cashier' ? <Navigate to="/cashier-dashboard" replace /> : <DashboardPage />} />

              <Route path="/cashier-dashboard" element={role === 'pos_cashier' ? <CashierDashboardPage /> : <Navigate to="/" replace />} />
              <Route path="/pos" element={<div className="flex-1 min-h-0 flex flex-col overflow-hidden h-full"><POSSalesPage /></div>} />
              <Route
                path="/sales-returns/new"
                element={['admin', 'pos_cashier'].includes(role) ? <SalesReturnCreatePage /> : <Navigate to="/" replace />}
              />
              <Route
                path="/sales-returns/:id"
                element={['admin', 'pos_cashier', 'accountant'].includes(role) ? <SalesReturnDetailPage /> : <Navigate to="/" replace />}
              />
              <Route
                path="/sales-returns"
                element={['admin', 'pos_cashier', 'accountant'].includes(role) ? <SalesReturnListPage /> : <Navigate to="/" replace />}
              />
              <Route path="/mobile-orders" element={['admin', 'pos_cashier'].includes(role) ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><MobileOrdersPage /></div> : <Navigate to="/" replace />} />
              <Route path="/offers" element={role === 'admin' ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><OffersPage /></div> : <Navigate to="/" replace />} />

              <Route path="/inventory" element={role === 'admin' ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><InventoryPage /></div> : <Navigate to="/" replace />} />
              <Route path="/procurement" element={['admin', 'accountant'].includes(role) ? <ProcurementPage /> : <Navigate to="/" replace />} />
              <Route path="/loyalty" element={role === 'admin' ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><LoyaltyPage /></div> : <Navigate to="/" replace />} />
              <Route path="/khata" element={['admin', 'pos_cashier', 'accountant'].includes(role) ? <KhataPage /> : <Navigate to="/" replace />} />
              <Route path="/multi-store" element={role === 'admin' ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><MultiStorePage /></div> : <Navigate to="/" replace />} />
              <Route path="/shifts" element={['admin', 'accountant'].includes(role) ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><ShiftsAdminPage /></div> : <Navigate to="/" replace />} />
              <Route path="/analytics" element={['admin', 'accountant'].includes(role) ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><BIDashboardsPage /></div> : <Navigate to="/" replace />} />
              <Route path="/accounting" element={['admin', 'accountant'].includes(role) ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><AccountingPage /></div> : <Navigate to="/" replace />} />
              <Route
                path="/accounting/reports/daily/*"
                element={['admin', 'accountant'].includes(role) ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><DailyReportPage /></div> : <Navigate to="/" replace />}
              />
              <Route path="/expenses" element={['admin', 'accountant'].includes(role) ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><ExpensePage /></div> : <Navigate to="/" replace />} />
              <Route path="/forecast" element={['admin', 'accountant'].includes(role) ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><ForecastPage /></div> : <Navigate to="/" replace />} />
              <Route path="/settings" element={<SettingsPage />} />

              <Route path="*" element={<Navigate to={role === 'pos_cashier' ? '/cashier-dashboard' : '/'} replace />} />
            </Routes>
            </div>
          </Suspense>
          </div>
          </div>
        </main>
      </div>
          </InventoryPageHeaderProvider>
          </MobileOrdersProvider>
        </ShiftsProvider>
      </AppProvider>
      </ConnectivityProvider>
    </BranchProvider>
  );
}

export default function App() {
  const { isAuthenticated, isLoading } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground transition-colors duration-300">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return authView === 'login'
      ? <LoginPage onSwitchToRegister={() => setAuthView('register')} />
      : <RegisterPage onSwitchToLogin={() => setAuthView('login')} />;
  }

  return <AppLayout />;
}
