import { Routes, Route, Navigate } from 'react-router-dom';
import { useRider } from './context/RiderContext';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import OrderDetailScreen from './screens/OrderDetailScreen';
import RiderLayout from './components/RiderLayout';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useRider();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route
        element={
          <RequireAuth>
            <RiderLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardScreen />} />
        <Route path="order/:orderId" element={<OrderDetailScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
