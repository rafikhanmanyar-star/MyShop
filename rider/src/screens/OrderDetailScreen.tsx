import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { riderApi } from '../api';
import { BottomSheetPanel } from '../components/BottomSheetPanel';
import { GoogleDeliveryMap, openGoogleMapsTurnByTurn, type RouteInfo } from '../components/GoogleDeliveryMap';
import { StatusButton } from '../components/StatusButton';
import { useRiderWork } from '../context/RiderWorkContext';
import { useToast } from '../context/ToastContext';

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
  branch_to_customer_km?: number | null;
  customer_name?: string;
  customer_phone?: string | null;
  items: Array<{ product_name: string; product_sku: string; quantity: number; subtotal: number }>;
};

export default function OrderDetailScreen() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const { refreshProfile } = useRiderWork();
  const { showToast } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);

  const onRouteInfo = useCallback((info: RouteInfo | null) => {
    setRouteInfo(info);
  }, []);

  const reload = async () => {
    if (!orderId) return;
    const x = await riderApi.getOrder(orderId);
    setD(x as Detail);
  };

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    riderApi
      .getOrder(orderId)
      .then((x) => setD(x as Detail))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [orderId]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await refreshProfile();
      await reload();
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Action failed';
      setErr(m);
      showToast(m);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !orderId) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (err && !d) {
    return (
      <div className="page">
        <p className="field-error">{err}</p>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="page">
        <p>Not found</p>
      </div>
    );
  }

  const lat = d.delivery_lat != null ? parseFloat(String(d.delivery_lat)) : NaN;
  const lng = d.delivery_lng != null ? parseFloat(String(d.delivery_lng)) : NaN;
  const custLat = Number.isFinite(lat) ? lat : null;
  const custLng = Number.isFinite(lng) ? lng : null;

  const ds = d.delivery_status;
  const showAccept = ds === 'ASSIGNED' && !d.accepted_at;
  const showPicked = ds === 'ASSIGNED' && !!d.accepted_at;
  const showOnWay = ds === 'PICKED';
  const showDelivered = ds === 'ON_THE_WAY';
  const done = ds === 'DELIVERED';

  const tel =
    d.customer_phone && String(d.customer_phone).replace(/\D/g, '').length > 0
      ? `tel:${d.customer_phone}`
      : null;

  const canNav = custLat != null && custLng != null;

  return (
    <div className="order-detail-page">
      <div className="order-detail-page__map-stack">
        <div className="order-detail-page__map">
          <GoogleDeliveryMap
            customerLat={custLat}
            customerLng={custLng}
            onRouteInfo={onRouteInfo}
            onRiderPosition={setRiderPos}
          />
        </div>
        {canNav ? (
          <div className="route-eta-bar">
            {routeInfo ? (
              <div className="route-eta-bar__metrics">
                <span className="route-eta-bar__pill">{routeInfo.distanceText}</span>
                <span className="route-eta-bar__pill route-eta-bar__pill--accent">{routeInfo.durationText}</span>
              </div>
            ) : (
              <span className="route-eta-bar__muted">
                {riderPos ? 'Calculating route…' : 'Waiting for GPS…'}
              </span>
            )}
            {routeInfo?.nextInstruction ? (
              <p className="route-eta-bar__next">{routeInfo.nextInstruction}</p>
            ) : null}
            <button
              type="button"
              className="btn btn-primary route-eta-bar__nav"
              onClick={() => openGoogleMapsTurnByTurn(custLat!, custLng!, riderPos)}
            >
              Start navigation
            </button>
          </div>
        ) : null}
      </div>

      <BottomSheetPanel title={d.order_number}>
        <button type="button" className="btn btn-ghost back-inline" onClick={() => nav(-1)}>
          ← Back
        </button>
        <div className="detail-head">
          <div>
            <div className="detail-kicker">Order</div>
            <div className="detail-name">{d.customer_name || 'Customer'}</div>
          </div>
          {tel ? (
            <a className="btn btn-primary call-btn" href={tel}>
              Call
            </a>
          ) : null}
        </div>

        {d.branch_to_customer_km != null && Number.isFinite(Number(d.branch_to_customer_km)) ? (
          <p className="detail-dist">
            Branch → customer ≈ {Number(d.branch_to_customer_km).toFixed(2)} km
          </p>
        ) : d.distance_km != null ? (
          <p className="detail-dist">Straight-line to customer ≈ {d.distance_km} km</p>
        ) : null}

        <p className="detail-addr">{d.delivery_address || '—'}</p>
        {d.delivery_notes ? <p className="muted small">Note: {d.delivery_notes}</p> : null}

        <div className="detail-items">
          <div className="detail-kicker">Items · Rs. {Number(d.grand_total).toLocaleString()}</div>
          <ul className="detail-ul">
            {d.items.map((it, i) => (
              <li key={i}>
                {it.product_name} × {it.quantity}
              </li>
            ))}
          </ul>
        </div>

        {err ? <p className="field-error">{err}</p> : null}

        <div className="status-stack">
          {showAccept ? (
            <StatusButton label="Accept" disabled={busy} onClick={() => run(() => riderApi.accept(orderId))} />
          ) : null}
          {showPicked ? (
            <StatusButton label="Picked up" disabled={busy} onClick={() => run(() => riderApi.picked(orderId))} />
          ) : null}
          {showOnWay ? (
            <StatusButton label="On the way" disabled={busy} onClick={() => run(() => riderApi.onTheWay(orderId))} />
          ) : null}
          {showDelivered ? (
            <StatusButton label="Delivered" disabled={busy} onClick={() => run(() => riderApi.delivered(orderId))} />
          ) : null}
          {done ? <p className="ok-text">Delivered. Great job.</p> : null}
        </div>

      </BottomSheetPanel>
    </div>
  );
}
