import { useNavigate } from 'react-router-dom';

const PLACEHOLDER = [
  { id: '1', title: 'New assignment', body: 'You will see alerts when dispatch assigns an order.', time: 'Live' },
  { id: '2', title: 'COD reminder', body: 'Settle cash with dispatch before going offline.', time: 'Daily' },
];

export default function NotificationsScreen() {
  const nav = useNavigate();
  return (
    <div className="r-page">
      <button type="button" className="r-btn r-btn--ghost" style={{ width: 'auto', marginBottom: 8 }} onClick={() => nav(-1)}>
        ← Back
      </button>
      <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>Notifications</h2>
      {PLACEHOLDER.map((n) => (
        <div key={n.id} className="r-card" style={{ marginBottom: 10 }}>
          <strong>{n.title}</strong>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--r-muted)' }}>{n.body}</p>
          <span style={{ fontSize: 12, color: 'var(--r-primary-dark)' }}>{n.time}</span>
        </div>
      ))}
    </div>
  );
}
