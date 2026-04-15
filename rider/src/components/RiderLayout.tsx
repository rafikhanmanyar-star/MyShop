import { Outlet } from 'react-router-dom';
import { NewOrderModal } from './NewOrderModal';
import { RiderWorkProvider } from '../context/RiderWorkContext';
import { useRiderGeolocation } from '../hooks/useRiderGeolocation';

function GeolocationRunner() {
  const { geoError } = useRiderGeolocation();
  if (!geoError) return null;
  return (
    <div
      style={{
        marginBottom: 12,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(248, 113, 113, 0.12)',
        border: '1px solid rgba(248, 113, 113, 0.35)',
        color: '#fecaca',
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      {geoError}
    </div>
  );
}

export default function RiderLayout() {
  return (
    <RiderWorkProvider>
      <GeolocationRunner />
      <NewOrderModal />
      <Outlet />
    </RiderWorkProvider>
  );
}
