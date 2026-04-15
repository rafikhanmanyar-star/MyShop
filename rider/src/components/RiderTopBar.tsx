import { useState } from 'react';
import { useRiderWork } from '../context/RiderWorkContext';
import { useRider } from '../context/RiderContext';
import { useToast } from '../context/ToastContext';

type Props = {
  /** When true, show compact ONLINE pill (order detail style). */
  compactOnline?: boolean;
};

export function RiderTopBar({ compactOnline }: Props) {
  const { logout } = useRider();
  const { profileLoading, online } = useRiderWork();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="rider-top-bar">
      {menuOpen ? (
        <button
          type="button"
          className="rider-top-bar__backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <button type="button" className="rider-top-bar__icon-btn" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
        <span className="rider-top-bar__burger" />
      </button>
      {menuOpen ? (
        <div className="rider-top-bar__menu">
          <button type="button" className="rider-top-bar__menu-item" onClick={() => { logout(); setMenuOpen(false); }}>
            Log out
          </button>
        </div>
      ) : null}

      <div className="rider-top-bar__brand">
        <span className="rider-top-bar__brand-mark" aria-hidden />
        <span className="rider-top-bar__brand-text">OBO RIDER</span>
      </div>

      <div className="rider-top-bar__right">
        {!compactOnline ? (
          <span className={`rider-pill rider-pill--online ${online ? 'is-on' : ''}`}>
            <span className="rider-pill__dot" />
            {profileLoading ? '…' : online ? 'ONLINE' : 'OFFLINE'}
          </span>
        ) : (
          <span className={`rider-pill rider-pill--compact ${online ? 'is-on' : ''}`}>
            ⚡ {profileLoading ? '…' : online ? 'ONLINE' : 'OFFLINE'}
          </span>
        )}
        <button
          type="button"
          className="rider-top-bar__icon-btn"
          aria-label="Notifications"
          onClick={() => showToast('No new notifications')}
        >
          <span className="rider-top-bar__bell" />
        </button>
      </div>
    </header>
  );
}
