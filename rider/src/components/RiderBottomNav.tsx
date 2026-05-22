import { useLocation, useNavigate } from 'react-router-dom';

const items = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/queue', label: 'Queue', icon: '📦' },
  { path: '/route', label: 'Route', icon: '🗺️' },
  { path: '/chat', label: 'Chat', icon: '💬' },
  { path: '/profile', label: 'Profile', icon: '👤' },
] as const;

export function RiderBottomNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const onOrder = loc.pathname.startsWith('/order/');

  if (onOrder) return null;

  return (
    <nav className="r-bottom-nav" aria-label="Main navigation">
      {items.map((it) => {
        const active = loc.pathname === it.path;
        return (
          <button
            key={it.path}
            type="button"
            className={`r-bottom-nav__item ${active ? 'is-active' : ''}`}
            onClick={() => nav(it.path)}
          >
            <span className="r-bottom-nav__icon" aria-hidden>
              {it.icon}
            </span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
