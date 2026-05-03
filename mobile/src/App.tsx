import { useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import ShopLoader from './pages/ShopLoader';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Checkout from './pages/Checkout';
import OrderConfirm from './pages/OrderConfirm';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import TrackOrder from './pages/TrackOrder';
import LandingPage from './pages/LandingPage';
import Offers from './pages/Offers';
import OfferDetail from './pages/OfferDetail';
import BudgetDashboard from './pages/BudgetDashboard';
import BudgetCreation from './pages/BudgetCreation';
import BudgetDetail from './pages/BudgetDetail';
import AccountSettings from './pages/AccountSettings';
import NotificationsPage from './pages/NotificationsPage';
import RecipeHome from './pages/RecipeHome';
import RecipeDetail from './pages/RecipeDetail';
import MyMenuPage from './pages/MyMenuPage';
import WeeklyMenuDashboardPage from './pages/menuPlanner/WeeklyMenuDashboardPage';
import WeeklyCalendarPage from './pages/menuPlanner/WeeklyCalendarPage';
import RecipePickerPage from './pages/menuPlanner/RecipePickerPage';
import ShoppingListPage from './pages/menuPlanner/ShoppingListPage';
import MenuTemplatesPage from './pages/menuPlanner/MenuTemplatesPage';
import NutritionSummaryPage from './pages/menuPlanner/NutritionSummaryPage';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import PWAReloadPrompt from './components/PWAReloadPrompt';
import OfflineBanner from './components/OfflineBanner';
import { processOrderQueue, subscribeToOnline } from './services/orderSyncService';
import { processPendingProductQueue } from './services/productSyncService';
import { processMenuPlannerQueue } from './services/menuPlannerSyncQueue';
import { useHeartbeat } from './hooks/useHeartbeat';

function HeartbeatReporter() {
  useHeartbeat();
  return null;
}

function LoyaltyBootstrap() {
  const { state, refreshLoyalty } = useApp();
  useEffect(() => {
    if (state.isLoggedIn && state.customerId) {
      void refreshLoyalty();
    }
  }, [state.isLoggedIn, state.customerId, refreshLoyalty]);
  return null;
}

function SyncOnOnline() {
  const { showToast, refreshLoyalty } = useApp();
  const processedRef = useRef(false);

  useEffect(() => {
    const runSync = async () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('myshop:mobile-sync:start'));
      }
      try {
        const [orderResult, productResult, menuPlannerResult] = await Promise.all([
          processOrderQueue(),
          processPendingProductQueue(),
          processMenuPlannerQueue(),
        ]);
        if (orderResult.succeeded > 0) {
          void refreshLoyalty({ force: true });
          showToast(orderResult.succeeded === 1 ? 'Order sent!' : `${orderResult.succeeded} orders sent!`);
        }
        if (productResult.succeeded > 0) {
          showToast(productResult.succeeded === 1 ? 'Product synced!' : `${productResult.succeeded} products synced!`);
        }
        if (menuPlannerResult.succeeded > 0) {
          showToast(
            menuPlannerResult.succeeded === 1
              ? 'Menu planner synced!'
              : `${menuPlannerResult.succeeded} menu planner updates synced!`
          );
        }
      } finally {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('myshop:mobile-sync:done'));
        }
      }
    };
    const unsub = subscribeToOnline(() => {
      runSync();
    });
    if (typeof navigator !== 'undefined' && navigator.onLine && !processedRef.current) {
      processedRef.current = true;
      runSync();
    }
    return unsub;
  }, [showToast, refreshLoyalty]);

  return null;
}

export default function App() {
  return (
    <AppProvider>
      <OfflineBanner />
      <LoyaltyBootstrap />
      <HeartbeatReporter />
      <SyncOnOnline />
      <Routes>
        {/* Shop slug entry point — loads shop branding */}
        <Route path="/:shopSlug" element={<ShopLoader />}>
          <Route index element={<Home />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="offers" element={<Offers />} />
          <Route path="offers/:id" element={<OfferDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="login" element={<Login />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="order-confirmed/:orderId" element={<OrderConfirm />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id/track" element={<TrackOrder />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="account" element={<AccountSettings />} />
          <Route path="notifications" element={<NotificationsPage />} />

          {/* Budget Feature */}
          <Route path="budget" element={<BudgetDashboard />} />
          <Route path="budget/create" element={<BudgetCreation />} />
          <Route path="budget/:id" element={<BudgetDetail />} />
          <Route path="recipes" element={<RecipeHome />} />
          <Route path="recipes/:id" element={<RecipeDetail />} />
          <Route path="my-menu" element={<MyMenuPage />} />
          <Route path="my-menu/pick" element={<RecipePickerPage />} />
          <Route path="menu-planner" element={<WeeklyMenuDashboardPage />} />
          <Route path="menu-planner/week/:menuId" element={<WeeklyCalendarPage />} />
          <Route path="menu-planner/week/:menuId/pick" element={<RecipePickerPage />} />
          <Route path="menu-planner/shopping/:listId" element={<ShoppingListPage />} />
          <Route path="menu-planner/templates" element={<MenuTemplatesPage />} />
          <Route path="menu-planner/nutrition/:menuId" element={<NutritionSummaryPage />} />
        </Route>

        {/* Landing page only at root — app is bound to shop when URL is /:shopSlug */}
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>

      {/* PWA Install & Update Prompts */}
      <PWAInstallPrompt />
      <PWAReloadPrompt />
    </AppProvider>
  );
}
