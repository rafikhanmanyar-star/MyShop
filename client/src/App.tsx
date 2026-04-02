import React, { useState, useEffect, lazy, Suspense } from 'react';
import { installElectronFocusRecovery } from './utils/electronFocusRecovery';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
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
    <aside className={`fixed inset-y-0 left-0 z-30 bg-[#0f172a] border-r border-slate-800/50 flex flex-col transition-all duration-500 ease-in-out shadow-2xl ${collapsed ? 'w-20' : 'w-72'}`}>
      <div className="flex items-center justify-between h-20 shrink-0 px-5">
        {!collapsed && (
          <div className="flex items-center gap-2.5 group cursor-pointer">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
              <Store className="w-[1.125rem] h-[1.125rem] text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-white text-lg tracking-tight leading-none text-shadow-sm">MyShop</span>
              <span className="text-xs text-slate-400 font-medium uppercase tracking-[0.2em]">Point of Sale</span>
            </div>
          </div>
        )}
        {collapsed && (
          <button
            onClick={onToggle}
            className="flex items-center justify-center w-full py-3 rounded-xl hover:bg-slate-800/80 text-slate-400 hover:text-white transition-all duration-200 group"
            title="Open sidebar"
          >
            <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
        {!collapsed && (
          <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all duration-200">
            <X className="w-[1.125rem] h-[1.125rem]" />
          </button>
        )}
      </div>

      <nav className="flex-1 min-h-0 px-3 space-y-0.5 overflow-y-auto custom-scrollbar pt-2">
        {filteredNavItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `nav-sidebar-link flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 group
              ${isActive
                ? 'bg-indigo-500/15 border border-indigo-500/30 text-primary font-semibold shadow-sm'
                : 'font-medium text-slate-400 hover:bg-slate-800/50 hover:text-white'}`
            }
          >
            <item.icon className={`w-[1.125rem] h-[1.125rem] flex-shrink-0 transition-transform duration-300 group-hover:scale-110 ${collapsed ? 'mx-auto' : ''}`} />
            {!collapsed && <span>{item.label}</span>}
            {!collapsed && (
              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 mt-auto shrink-0">
        <div className={`bg-slate-800/40 rounded-2xl p-3 border border-slate-700/50 transition-all duration-300 ${collapsed ? 'px-2' : ''}`}>
          {!collapsed && user && (
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center border-2 border-indigo-500/50 overflow-hidden">
                <Users className="w-[1.125rem] h-[1.125rem] text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{user.name}</p>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{user.role.replace('_', ' ')}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 text-slate-400 hover:text-rose-400 transition-colors w-full group ${collapsed ? 'justify-center' : 'px-2 py-1'}`}
          >
            <LogOut className="w-[1.125rem] h-[1.125rem] group-hover:-translate-x-1 transition-transform" />
            {!collapsed && <span className="font-semibold text-xs tracking-wide">Sign out</span>}
          </button>
          {!collapsed && (
            <p className="text-xs text-slate-500 text-center mt-2 pt-1.5 border-t border-slate-700/50">
              v{__APP_VERSION__}
            </p>
          )}
        </div>
      </div>

      {collapsed && (
        <>
          <button onClick={onToggle} className="mb-2 mx-auto p-2.5 bg-slate-800/50 rounded-xl text-slate-400 hover:text-white hover:bg-indigo-600 transition-all">
            <Menu className="w-5 h-5" />
          </button>
          <p className="text-xs text-slate-500 text-center pb-2">v{__APP_VERSION__}</p>
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
        <main className={`flex min-h-0 flex-1 flex-col transition-all duration-500 ease-in-out ${posFullScreen ? 'ml-0' : sidebarCollapsed ? 'ml-20' : 'ml-72'} p-6 sm:p-8`}>
          {!posFullScreen && <AppHeader />}
          <OfflineBanner />
          <div className="flex-1 min-h-0 flex flex-col overflow-auto">
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-4 border-indigo-200 dark:border-indigo-800 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 rounded-full animate-spin border-t-transparent"></div>
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
