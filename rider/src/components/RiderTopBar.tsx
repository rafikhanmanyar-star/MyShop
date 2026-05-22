import { useLocation } from 'react-router-dom';
import { useRiderWork } from '../context/RiderWorkContext';

export function RiderTopBar() {
  const { online, profile } = useRiderWork();
  const loc = useLocation();
  const onOrder = loc.pathname.startsWith('/order/');

  if (onOrder) return null;

  return (
    <header className="rider-top--enterprise">
      <span className="rider-top__brand">MyShop Rider</span>
      <div className="rider-top__online">
        <span className={`r-online-dot ${online ? 'is-on' : ''}`} aria-hidden />
        {online ? (profile?.status === 'BUSY' ? 'On delivery' : 'Online') : 'Offline'}
      </div>
    </header>
  );
}
