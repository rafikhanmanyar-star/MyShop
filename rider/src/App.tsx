import { Routes, Route, Navigate } from 'react-router-dom';
import { useRider } from './context/RiderContext';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import QueueScreen from './screens/QueueScreen';
import CashScreen from './screens/CashScreen';
import EarningsScreen from './screens/EarningsScreen';
import ProfileScreen from './screens/ProfileScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ChatScreen from './screens/ChatScreen';
import RouteScreen from './screens/RouteScreen';
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
        <Route index element={<HomeScreen />} />
        <Route path="queue" element={<QueueScreen />} />
        <Route path="cash" element={<CashScreen />} />
        <Route path="earnings" element={<EarningsScreen />} />
        <Route path="profile" element={<ProfileScreen />} />
        <Route path="notifications" element={<NotificationsScreen />} />
        <Route path="chat" element={<ChatScreen />} />
        <Route path="chat/:orderId" element={<ChatScreen />} />
        <Route path="route" element={<RouteScreen />} />
        <Route path="order/:orderId" element={<OrderDetailScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
