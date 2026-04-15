import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { riderApi } from '../api';

type Detail = {
  order_id: string;
  order_number: string;
  order_status: string;
  delivery_status: string;
  accepted_at?: string | null;
  delivery_address: string;
  delivery_lat?: string | number | null;
  delivery_lng?: string | number | null;
  delivery_notes?: string | null;
  grand_total: number;
  distance_km: number | null;
  items: Array<{ product_name: string; product_sku: string; quantity: number; subtotal: number }>;
};

export default function OrderDetail() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    riderApi
      .getOrder(orderId)
      .then((x) => setD(x as Detail))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [orderId]);

  const mapUrl =
    d?.delivery_lat != null && d?.delivery_lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(d.delivery_lat))},${encodeURIComponent(String(d.delivery_lng))}`
      : null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      if (orderId) {
        const x = await riderApi.getOrder(orderId);
        setD(x as Detail);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !orderId) return <div className="page">Loading…</div>;
  if (err && !d) return <div className="page"><p style={{ color: '#f87171' }}>{err}</p></div>;
  if (!d) return <div className="page">Not found</div>;

  const ds = d.delivery_status;
  const canAccept = ds === 'ASSIGNED' && !d.accepted_at;
  const canPick = ds === 'ASSIGNED';
  const canDeliver = ds === 'PICKED' || ds === 'ON_THE_WAY';

  return (
    <div className="page">
      <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={() => nav(-1)}>
        ← Back
      </button>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>{d.order_number}</h1>
      <p style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: 14 }}>
        Shop order status: <strong>{d.order_status}</strong> · Delivery: <strong>{ds}</strong>
      </p>
      {d.distance_km != null ? (
        <p style={{ fontSize: 14, color: 'var(--ok)' }}>≈ {d.distance_km} km (to your last known location)</p>
      ) : null}

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Deliver to</h2>
        <p style={{ margin: 0, lineHeight: 1.5 }}>{d.delivery_address || '—'}</p>
        {d.delivery_notes ? <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)' }}>Note: {d.delivery_notes}</p> : null}
        {mapUrl ? (
          <a href={mapUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10 }}>
            Open in Google Maps
          </a>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Items · Rs. {Number(d.grand_total).toLocaleString()}</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {d.items.map((it, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {it.product_name} × {it.quantity}
            </li>
          ))}
        </ul>
      </div>

      {err ? <p style={{ color: '#f87171' }}>{err}</p> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {canAccept ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => riderApi.accept(orderId))}>
            Accept order
          </button>
        ) : null}
        {canPick ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => riderApi.picked(orderId))}>
            Mark picked
          </button>
        ) : null}
        {canDeliver ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => riderApi.delivered(orderId))}>
            Mark delivered
          </button>
        ) : null}
        {ds === 'DELIVERED' ? <p style={{ color: 'var(--ok)' }}>Completed.</p> : null}
      </div>
    </div>
  );
}
