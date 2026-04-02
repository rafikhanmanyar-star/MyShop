import React, { useState, useEffect, lazy, Suspense } from 'react';
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
  BarChart3, BookOpen, Settings, LogOut, Menu, X, Store, Smartphone, Brain, ChevronRight, Wallet, ClipboardList, Receipt, Undo2
} from 'lucide-react';
import { BranchProvider } from './context/BranchContext';
import { SyncOnOnline } from './components/SyncOnOnline';
import OfflineBanner from './components/OfflineBanner';
import AppHeader from './components/AppHeader';

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
const ForecastPage = lazy(() => import('./components/shop/ForecastPage'));
const CashierDashboardPage = lazy(() => import('./components/shop/cashier/CashierDashboardPage'));
const ShiftsAdminPage = lazy(() => import('./components/shop/cashier/ShiftsAdminPage'));
const KhataPage = lazy(() => import('./components/shop/khata/KhataPage'));
const SalesReturnListPage = lazy(() => import('./components/shop/salesReturns/SalesReturnListPage'));
const SalesReturnCreatePage = lazy(() => import('./components/shop/salesReturns/SalesReturnCreatePage'));
const SalesReturnDetailPage = lazy(() => import('./components/shop/salesReturns/SalesReturnDetailPage'));
const ShopRealtimeBridge = lazy(() => import('./components/shop/ShopRealtimeBridge'));

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'accountant'] },
  { path: '/cashier-dashboard', label: 'Cashier Dashboard', icon: ClipboardList, roles: ['pos_cashier'] },
  { path: '/pos', label: 'Point of Sale', icon: ShoppingCart, roles: ['admin', 'pos_cashier'] },
  { path: '/sales-returns', label: 'Sales Return', icon: Undo2, roles: ['admin', 'pos_cashier', 'accountant'] },
  { path: '/mobile-orders', label: 'Mobile Orders', icon: Smartphone, roles: ['admin', 'pos_cashier'] },
  { path: '/inventory', label: 'Inventory', icon: Package, roles: ['admin'] },
  { path: '/procurement', label: 'Procurement', icon: Truck, roles: ['admin', 'accountant'] },
  { path: '/loyalty', label: 'Loyalty', icon: Users, roles: ['admin'] },
  { path: '/khata', label: 'Khata Ledger', icon: Receipt, roles: ['admin', 'pos_cashier', 'accountant'] },
  { path: '/multi-store', label: 'Multi-Store', icon: Building2, roles: ['admin'] },
  { path: '/shifts', label: 'Shifts', icon: ClipboardList, roles: ['admin', 'accountant'] },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'accountant'] },
  { path: '/accounting', label: 'Accounting', icon: BookOpen, roles: ['admin', 'accountant'] },
  { path: '/expenses', label: 'Expenses', icon: Wallet, roles: ['admin', 'accountant'] },
  { path: '/forecast', label: 'Forecasting', icon: Brain, roles: ['admin', 'accountant'] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'accountant', 'pos_cashier'] },
];

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const filteredNavItems = navItems.filter(item =>
    !user || !item.roles || item.roles.includes(user.role)
  );

  return (
    <aside className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-gray-800 bg-gray-900 shadow-xl transition-all duration-300 ease-in-out ${collapsed ? 'w-20' : 'w-72'}`}>
      <div className="flex h-20 shrink-0 items-center justify-between px-5">
        {!collapsed && (
          <div className="group flex cursor-pointer items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 shadow-md shadow-primary-900/30 transition-transform duration-200 group-hover:scale-105">
              <Store className="h-[1.125rem] w-[1.125rem] text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold leading-none tracking-tight text-white text-shadow-sm">MyShop</span>
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-gray-400">Point of Sale</span>
            </div>
          </div>
        )}
        {collapsed && (
          <button
            onClick={onToggle}
            className="group flex w-full items-center justify-center rounded-lg py-3 text-gray-400 transition-colors duration-200 hover:bg-gray-800 hover:text-white"
            title="Open sidebar"
          >
            <ChevronRight className="h-6 w-6 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg p-1.5 text-gray-400 transition-colors duration-200 hover:bg-gray-800 hover:text-white"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <X className="h-[1.125rem] w-[1.125rem]" />
          </button>
        )}
      </div>

      <nav className="custom-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pt-2">
        {filteredNavItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `nav-sidebar-link group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-200
              ${isActive
                ? 'bg-primary-600 font-semibold text-white shadow-sm'
                : 'font-medium text-gray-300 hover:bg-gray-800 hover:text-white'}`
            }
          >
            <item.icon className={`h-[1.125rem] w-[1.125rem] flex-shrink-0 ${collapsed ? 'mx-auto' : ''}`} />
            {!collapsed && <span>{item.label}</span>}
            {!collapsed && (
              <div className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
                <div className="h-1.5 w-1.5 rounded-full bg-white/80" />
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto shrink-0 p-3">
        <div className={`rounded-lg border border-gray-700/80 bg-gray-800/50 p-3 transition-all duration-200 ${collapsed ? 'px-2' : ''}`}>
          {!collapsed && user && (
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-primary-600/50 bg-gray-700">
                <Users className="h-[1.125rem] w-[1.125rem] text-primary-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{user.name}</p>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{user.role.replace('_', ' ')}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={`group flex w-full items-center gap-2 text-gray-400 transition-colors hover:text-red-400 ${collapsed ? 'justify-center' : 'px-2 py-1'}`}
          >
            <LogOut className="h-[1.125rem] w-[1.125rem] transition-transform group-hover:-translate-x-1" />
            {!collapsed && <span className="text-xs font-semibold tracking-wide">Sign out</span>}
          </button>
          {!collapsed && (
            <p className="mt-2 border-t border-gray-700/50 pt-1.5 text-center text-xs text-gray-500">
              v{__APP_VERSION__}
            </p>
          )}
        </div>
      </div>

      {collapsed && (
        <>
          <button
            type="button"
            onClick={onToggle}
            className="mx-auto mb-2 rounded-lg bg-gray-800/80 p-2.5 text-gray-400 transition-all hover:bg-primary-600 hover:text-white"
            title="Open navigation menu"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="pb-2 text-center text-xs text-gray-500">v{__APP_VERSION__}</p>
        </>
      )}
    </aside>
  );
}

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [posFullScreen, setPosFullScreen] = useState(false);
  const { user } = useAuth();
  const role = user?.role || 'pos_cashier';
  const location = useLocation();
  const isPosRoute = location.pathname === '/pos';

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
      <AppProvider>
        <ShiftsProvider>
          <SyncOnOnline />
          <Suspense fallback={null}>
            <ShopRealtimeBridge />
          </Suspense>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        {!posFullScreen && <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />}
        <main className={`flex min-h-0 flex-1 flex-col transition-all duration-300 ease-in-out ${posFullScreen ? 'ml-0' : sidebarCollapsed ? 'ml-20' : 'ml-72'}`}>
          <div
            className={`flex min-h-0 flex-1 flex-col overflow-auto ${isPosRoute ? 'w-full p-6' : 'page-container'}`}
          >
          {!posFullScreen && <AppHeader />}
          <OfflineBanner />
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
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
        </ShiftsProvider>
      </AppProvider>
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
