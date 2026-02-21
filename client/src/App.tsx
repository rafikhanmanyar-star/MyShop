import React, { useState, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './components/shop/SettingsPage';
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, Building2,
  BarChart3, BookOpen, Settings, LogOut, Menu, X, Store, Smartphone,
} from 'lucide-react';

const POSSalesPage = lazy(() => import('./components/shop/POSSalesPage'));
const InventoryPage = lazy(() => import('./components/shop/InventoryPage'));
const ProcurementPage = lazy(() => import('./components/shop/ProcurementPage'));
const LoyaltyPage = lazy(() => import('./components/shop/LoyaltyPage'));
const MultiStorePage = lazy(() => import('./components/shop/MultiStorePage'));
const BIDashboardsPage = lazy(() => import('./components/shop/BIDashboardsPage'));
const AccountingPage = lazy(() => import('./components/shop/AccountingPage'));
const MobileOrdersPage = lazy(() => import('./components/shop/MobileOrdersPage'));

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'accountant'] },
  { path: '/pos', label: 'Point of Sale', icon: ShoppingCart, roles: ['admin', 'pos_cashier'] },
  { path: '/mobile-orders', label: 'Mobile Orders', icon: Smartphone, roles: ['admin', 'pos_cashier'] },
  { path: '/inventory', label: 'Inventory', icon: Package, roles: ['admin'] },
  { path: '/procurement', label: 'Procurement', icon: Truck, roles: ['admin', 'accountant'] },
  { path: '/loyalty', label: 'Loyalty', icon: Users, roles: ['admin'] },
  { path: '/multi-store', label: 'Multi-Store', icon: Building2, roles: ['admin'] },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'accountant'] },
  { path: '/accounting', label: 'Accounting', icon: BookOpen, roles: ['admin', 'accountant'] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
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
      <div className="flex items-center justify-between h-24 px-6">
        {!collapsed && (
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-white text-lg tracking-tight leading-none text-shadow-sm">MyShop</span>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-[0.2em]">Point of Sale</span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/20">
            <Store className="w-5 h-5 text-white" />
          </div>
        )}
        {!collapsed && (
          <button onClick={onToggle} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all duration-200">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar pt-4">
        {filteredNavItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm transition-all duration-300 group
              ${isActive
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/25 font-semibold'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white font-medium'}`
            }
          >
            <item.icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 ${collapsed ? 'mx-auto' : ''}`} />
            {!collapsed && <span className="tracking-wide">{item.label}</span>}
            {!collapsed && (
              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 mt-auto">
        <div className={`bg-slate-800/40 rounded-3xl p-4 border border-slate-700/50 transition-all duration-300 ${collapsed ? 'px-2' : ''}`}>
          {!collapsed && user && (
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-indigo-500/50 overflow-hidden">
                <Users className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{user.name}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">{user.role.replace('_', ' ')}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 text-slate-400 hover:text-rose-400 transition-colors w-full group ${collapsed ? 'justify-center' : 'px-2 py-1'}`}
          >
            <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            {!collapsed && <span className="font-semibold text-xs tracking-wide">Sign out</span>}
          </button>
        </div>
      </div>

      {collapsed && (
        <button onClick={onToggle} className="mb-6 mx-auto p-2.5 bg-slate-800/50 rounded-xl text-slate-400 hover:text-white hover:bg-indigo-600 transition-all">
          <Menu className="w-5 h-5" />
        </button>
      )}
    </aside>
  );
}

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user } = useAuth();
  const role = user?.role || 'pos_cashier';

  return (
    <AppProvider>
      <div className="min-h-screen bg-[#f8fafc]">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className={`transition-all duration-500 ease-in-out ${sidebarCollapsed ? 'ml-20' : 'ml-72'} p-8 min-h-screen`}>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-4 border-indigo-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 rounded-full animate-spin border-t-transparent"></div>
              </div>
            </div>
          }>
            <Routes>
              {/* Redirect pos_cashier to /pos if they try to access / */}
              <Route path="/" element={role === 'pos_cashier' ? <Navigate to="/pos" replace /> : <DashboardPage />} />

              <Route path="/pos" element={<POSSalesPage />} />
              <Route path="/mobile-orders" element={['admin', 'pos_cashier'].includes(role) ? <MobileOrdersPage /> : <Navigate to="/" replace />} />

              <Route path="/inventory" element={role === 'admin' ? <InventoryPage /> : <Navigate to="/" replace />} />
              <Route path="/procurement" element={['admin', 'accountant'].includes(role) ? <ProcurementPage /> : <Navigate to="/" replace />} />
              <Route path="/loyalty" element={role === 'admin' ? <LoyaltyPage /> : <Navigate to="/" replace />} />
              <Route path="/multi-store" element={role === 'admin' ? <MultiStorePage /> : <Navigate to="/" replace />} />
              <Route path="/analytics" element={['admin', 'accountant'].includes(role) ? <BIDashboardsPage /> : <Navigate to="/" replace />} />
              <Route path="/accounting" element={['admin', 'accountant'].includes(role) ? <AccountingPage /> : <Navigate to="/" replace />} />
              <Route path="/settings" element={role === 'admin' ? <SettingsPage /> : <Navigate to="/" replace />} />

              <Route path="*" element={<Navigate to={role === 'pos_cashier' ? '/pos' : '/'} replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </AppProvider>
  );
}

export default function App() {
  const { isAuthenticated, isLoading } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
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
