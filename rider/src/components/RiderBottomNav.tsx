import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

const items = [
  { id: 'orders', label: 'ORDERS', icon: 'truck' },
  { id: 'earn', label: 'EARNINGS', icon: 'wallet' },
  { id: 'map', label: 'MAP', icon: 'map' },
  { id: 'profile', label: 'PROFILE', icon: 'user' },
] as const;

export function RiderBottomNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const { showToast } = useToast();

  const onOrderDetail = loc.pathname.startsWith('/order/');

  return (
    <nav className="rider-bottom-nav" aria-label="Main">
      {items.map((it) => {
        const active =
          (it.id === 'orders' && loc.pathname === '/') || (it.id === 'map' && onOrderDetail);

        const go = () => {
          if (it.id === 'orders') {
            nav('/');
            return;
          }
          if (it.id === 'map') {
            if (onOrderDetail) showToast('Map is shown above');
            else showToast('Open an order to view the map');
            return;
          }
          showToast('Coming soon');
        };

        return (
          <button key={it.id} type="button" className={`rider-bottom-nav__item ${active ? 'is-active' : ''}`} onClick={go}>
            <span className={`rider-bottom-nav__ico rider-bottom-nav__ico--${it.icon}`} aria-hidden />
            <span className="rider-bottom-nav__label">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
