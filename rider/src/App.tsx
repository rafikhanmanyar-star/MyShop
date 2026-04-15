import { Routes, Route, Navigate } from 'react-router-dom';
import { useRider } from './context/RiderContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OrderDetail from './pages/OrderDetail';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useRider();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/order/:orderId"
        element={
          <RequireAuth>
            <OrderDetail />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
