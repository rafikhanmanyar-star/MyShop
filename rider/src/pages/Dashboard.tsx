import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { riderApi } from '../api';
import { useRider } from '../context/RiderContext';

type Row = {
  delivery_order_id: string;
  delivery_status: string;
  order_id: string;
  order_number: string;
  order_status: string;
  grand_total: number;
  delivery_address: string;
  created_at: string;
};

export default function Dashboard() {
  const { logout, riderName, shopSlug } = useRider();
  const [orders, setOrders] = useState<Row[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setErr('');
    riderApi
      .getOrders()
      .then((d: { orders: Row[] }) => setOrders(d.orders || []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>Deliveries</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            {riderName} · {shopSlug}
          </p>
        </div>
        <button type="button" className="btn" onClick={() => logout()}>
          Log out
        </button>
      </div>

      {loading ? <p style={{ color: 'var(--muted)' }}>Loading…</p> : null}
      {err ? <p style={{ color: '#f87171' }}>{err}</p> : null}

      {!loading && orders.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No assigned orders yet.</p>
      ) : null}

      {orders.map((o) => (
        <Link key={o.delivery_order_id} to={`/order/${o.order_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <strong>{o.order_number}</strong>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{o.delivery_address || '—'}</div>
              </div>
              <span className="badge">{o.delivery_status}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
              Order: {o.order_status} · Rs. {Number(o.grand_total).toLocaleString()}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
