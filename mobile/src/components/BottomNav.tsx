import { useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { bottomNavGradients } from './bottomNav/bottomNavTokens';
import { bottomNavIcons } from './bottomNav/bottomNavIcons';
import { ModernNavButton } from './bottomNav/ModernNavButton';
import type { BottomNavItem } from './bottomNav/bottomNavTypes';

export default function BottomNav() {
  const { shopSlug } = useParams();
  const { pathname } = useLocation();
  const { cartCount } = useApp();

  const items = useMemo<BottomNavItem[]>(() => {
    if (!shopSlug) return [];
    const base = `/${shopSlug}`;
    const g = bottomNavGradients;

    return [
      {
        id: 'home',
        label: 'Home',
        path: base,
        icon: bottomNavIcons.home,
        gradientFrom: g.home.from,
        gradientTo: g.home.to,
        glowColor: g.home.glow,
      },
      {
        id: 'browse',
        label: 'Browse',
        path: `${base}/products`,
        icon: bottomNavIcons.browse,
        gradientFrom: g.browse.from,
        gradientTo: g.browse.to,
        glowColor: g.browse.glow,
      },
      {
        id: 'offers',
        label: 'Offers',
        path: `${base}/offers`,
        icon: bottomNavIcons.offers,
        gradientFrom: g.offers.from,
        gradientTo: g.offers.to,
        glowColor: g.offers.glow,
      },
      {
        id: 'cart',
        label: 'Cart',
        path: `${base}/cart`,
        icon: bottomNavIcons.cart,
        gradientFrom: g.cart.from,
        gradientTo: g.cart.to,
        glowColor: g.cart.glow,
      },
      {
        id: 'orders',
        label: 'Orders',
        path: `${base}/orders`,
        icon: bottomNavIcons.orders,
        gradientFrom: g.orders.from,
        gradientTo: g.orders.to,
        glowColor: g.orders.glow,
      },
      {
        id: 'utils',
        label: 'Utils',
        path: `${base}/utilities`,
        icon: bottomNavIcons.utils,
        gradientFrom: g.utils.from,
        gradientTo: g.utils.to,
        glowColor: g.utils.glow,
      },
    ];
  }, [shopSlug]);

  if (!shopSlug) return null;

  const base = `/${shopSlug}`;

  const isActive = (item: BottomNavItem) => {
    if (item.id === 'home') return pathname === base;
    if (item.id === 'utils') {
      return (
        pathname === `${base}/utilities` ||
        pathname.startsWith(`${base}/utilities/`) ||
        pathname.startsWith(`${base}/feedback`) ||
        pathname.startsWith(`${base}/budget`) ||
        pathname.startsWith(`${base}/recipes`) ||
        pathname.startsWith(`${base}/my-menu`) ||
        pathname.startsWith(`${base}/menu-planner`)
      );
    }
    return pathname.startsWith(item.path);
  };

  return (
    <div className="modern-bottom-nav">
      <nav className="modern-bottom-nav__bar" aria-label="Main navigation">
        {items.map((item) => (
          <ModernNavButton
            key={item.id}
            item={item}
            active={isActive(item)}
            badge={item.id === 'cart' ? cartCount : undefined}
            title={item.id === 'utils' ? 'Utilities' : undefined}
          />
        ))}
      </nav>
    </div>
  );
}
