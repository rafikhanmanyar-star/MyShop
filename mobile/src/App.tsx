import { useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import ShopLoader from './pages/ShopLoader';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Login from './pages/Login';
import Checkout from './pages/Checkout';
import OrderConfirm from './pages/OrderConfirm';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import LandingPage from './pages/LandingPage';
import Offers from './pages/Offers';
import OfferDetail from './pages/OfferDetail';
import BudgetDashboard from './pages/BudgetDashboard';
import BudgetCreation from './pages/BudgetCreation';
import BudgetDetail from './pages/BudgetDetail';
import AccountSettings from './pages/AccountSettings';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import PWAReloadPrompt from './components/PWAReloadPrompt';
import OfflineBanner from './components/OfflineBanner';
import { processOrderQueue, subscribeToOnline } from './services/orderSyncService';
import { processPendingProductQueue } from './services/productSyncService';

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
      const [orderResult, productResult] = await Promise.all([
        processOrderQueue(),
        processPendingProductQueue(),
      ]);
      if (orderResult.succeeded > 0) {
        void refreshLoyalty({ force: true });
        showToast(orderResult.succeeded === 1 ? 'Order sent!' : `${orderResult.succeeded} orders sent!`);
      }
      if (productResult.succeeded > 0) {
        showToast(productResult.succeeded === 1 ? 'Product synced!' : `${productResult.succeeded} products synced!`);
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
          <Route path="checkout" element={<Checkout />} />
          <Route path="order-confirmed/:orderId" element={<OrderConfirm />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="account" element={<AccountSettings />} />

          {/* Budget Feature */}
          <Route path="budget" element={<BudgetDashboard />} />
          <Route path="budget/create" element={<BudgetCreation />} />
          <Route path="budget/:id" element={<BudgetDetail />} />
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
