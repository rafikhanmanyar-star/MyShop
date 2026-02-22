import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
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
import BudgetDashboard from './pages/BudgetDashboard';
import BudgetCreation from './pages/BudgetCreation';
import BudgetDetail from './pages/BudgetDetail';

export default function App() {
  return (
    <AppProvider>
      <Routes>
        {/* Shop slug entry point — loads shop branding */}
        <Route path="/:shopSlug" element={<ShopLoader />}>
          <Route index element={<Home />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="login" element={<Login />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="order-confirmed/:orderId" element={<OrderConfirm />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />

          {/* Budget Feature */}
          <Route path="budget" element={<BudgetDashboard />} />
          <Route path="budget/create" element={<BudgetCreation />} />
          <Route path="budget/:id" element={<BudgetDetail />} />
        </Route>

        {/* Landing page — auto-discovers shops or allows manual entry */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </AppProvider>
  );
}
