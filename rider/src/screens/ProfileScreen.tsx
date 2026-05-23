import { useNavigate } from 'react-router-dom';
import { useRider } from '../context/RiderContext';
import { useRiderWork } from '../context/RiderWorkContext';

export default function ProfileScreen() {
  const { riderName, shopSlug, logout } = useRider();
  const { profile } = useRiderWork();
  const nav = useNavigate();

  const handleLogout = () => {
    logout();
    nav('/login', { replace: true });
  };

  return (
    <div className="r-page">
      <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>Profile</h2>
      <div className="r-card">
        <p style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>{riderName || profile?.name || 'Rider'}</p>
        <p style={{ margin: '8px 0 0', color: 'var(--r-muted)' }}>{profile?.phone_number || ''}</p>
        <p style={{ margin: '4px 0 0', color: 'var(--r-muted)' }}>Shop: {shopSlug}</p>
        <p style={{ margin: '4px 0 0', color: 'var(--r-muted)' }}>Status: {profile?.status ?? '—'}</p>
      </div>
      <button type="button" className="r-btn r-btn--outline" style={{ marginTop: 16 }} onClick={() => nav('/earnings')}>
        Performance & earnings
      </button>
      <button type="button" className="r-btn r-btn--outline" style={{ marginTop: 10 }} onClick={() => nav('/cash')}>
        Cash (COD)
      </button>
      <button type="button" className="r-btn r-btn--outline" style={{ marginTop: 10 }} onClick={() => nav('/notifications')}>
        Notifications
      </button>
      <button type="button" className="r-btn r-btn--danger" style={{ marginTop: 12 }} onClick={handleLogout}>
        Sign out
      </button>
    </div>
  );
}
