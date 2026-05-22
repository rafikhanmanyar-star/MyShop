import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NewOrderModal } from './NewOrderModal';
import { RiderBottomNav } from './RiderBottomNav';
import { RiderTopBar } from './RiderTopBar';
import { RiderWorkProvider } from '../context/RiderWorkContext';
import { useRiderGeolocation } from '../hooks/useRiderGeolocation';
import { startOfflineSyncListener } from '../lib/offlineSync';

function GeolocationRunner() {
  const { geoError } = useRiderGeolocation();
  if (!geoError) return null;
  return <div className="rider-geo-warn">{geoError}</div>;
}

function RiderShell() {
  const loc = useLocation();
  const hideChrome = loc.pathname.startsWith('/order/') || loc.pathname === '/login';

  useEffect(() => startOfflineSyncListener(), []);

  return (
    <div className="rider-app rider-app--enterprise">
      {!hideChrome ? <RiderTopBar /> : null}
      <GeolocationRunner />
      <main className="rider-app__main">
        <Outlet />
      </main>
      {!hideChrome ? <RiderBottomNav /> : null}
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
