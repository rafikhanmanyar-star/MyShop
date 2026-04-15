import { Outlet, useLocation } from 'react-router-dom';
import { NewOrderModal } from './NewOrderModal';
import { RiderBottomNav } from './RiderBottomNav';
import { RiderTopBar } from './RiderTopBar';
import { RiderWorkProvider } from '../context/RiderWorkContext';
import { useRiderGeolocation } from '../hooks/useRiderGeolocation';

function GeolocationRunner() {
  const { geoError } = useRiderGeolocation();
  if (!geoError) return null;
  return <div className="rider-geo-warn">{geoError}</div>;
}

function RiderShell() {
  const loc = useLocation();
  const compactTop = loc.pathname.startsWith('/order/');

  return (
    <div className="rider-app">
      <RiderTopBar compactOnline={compactTop} />
      <GeolocationRunner />
      <main className="rider-app__main">
        <Outlet />
      </main>
      <RiderBottomNav />
      <NewOrderModal />
    </div>
  );
}

export default function RiderLayout() {
  return (
    <RiderWorkProvider>
      <RiderShell />
    </RiderWorkProvider>
  );
}
