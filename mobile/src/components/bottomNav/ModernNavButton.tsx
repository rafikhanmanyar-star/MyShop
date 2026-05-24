import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { BottomNavItem } from './bottomNavTypes';
import { triggerNavHaptic } from './hapticFeedback';

interface ModernNavButtonProps {
  item: BottomNavItem;
  active: boolean;
  badge?: number;
  title?: string;
}

export function ModernNavButton({ item, active, badge, title }: ModernNavButtonProps) {
  const style = {
    '--nav-gradient-from': item.gradientFrom,
    '--nav-gradient-to': item.gradientTo,
    '--nav-glow-color': item.glowColor,
  } as CSSProperties;

  return (
    <Link
      to={item.path}
      className={`modern-nav-button${active ? ' is-active' : ''}`}
      style={style}
      title={title ?? item.label}
      aria-current={active ? 'page' : undefined}
      onClick={() => triggerNavHaptic()}
    >
      <span className="modern-nav-button__shell">
        <span className="modern-nav-button__glow" aria-hidden />
        <span className="modern-nav-button__face">
          <span className="modern-nav-button__shine" aria-hidden />
          <span className="modern-nav-button__icon">{item.icon}</span>
          {badge != null && badge > 0 ? (
            <span className="modern-nav-button__badge">{badge > 99 ? '99+' : badge}</span>
          ) : null}
        </span>
      </span>
      <span className="modern-nav-button__label">{item.label}</span>
    </Link>
  );
}
