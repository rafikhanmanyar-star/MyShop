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
  payment_method?: string | null;
  items: Array<{ product_name: string; product_sku: string; quantity: number; subtotal: number }>;
};

function deliveryProgress(ds: string, accepted: boolean): number {
  if (ds === 'DELIVERED') return 4;
  if (ds === 'ON_THE_WAY') return 3;
  if (ds === 'PICKED') return 2;
  if (ds === 'ASSIGNED' && accepted) return 1;
  return 0;
}

function formatPkr(n: number) {
  return `PKR ${Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
      <div className="page order-detail-loading">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (err && !d) {
    return (
      <div className="page order-detail-loading">
        <p className="field-error">{err}</p>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="page order-detail-loading">
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
  const prog = deliveryProgress(ds, !!d.accepted_at);
  const phaseLabel = done
    ? 'DELIVERED'
    : showDelivered
      ? 'ARRIVING'
      : showOnWay
        ? 'ON THE WAY'
        : showPicked
          ? 'PICKED UP'
          : showAccept
            ? 'NEW ASSIGNMENT'
            : 'ACTIVE';

  const paymentLabel = d.payment_method || 'COD';
  const estWeight = d.items?.length
    ? `${(d.items.reduce((s, i) => s + Number(i.quantity || 0), 0) * 0.5).toFixed(1)} kg est.`
    : '—';

  return (
    <div className="order-detail-page order-detail-page--obo">
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
          <div className="route-eta-bar route-eta-bar--overlay">
            {routeInfo ? (
              <div className="route-eta-bar__metrics route-eta-bar__metrics--compact">
                <span className="route-eta-bar__time">
                  {routeInfo.durationText.replace(/\bmins?\b/i, 'MIN').replace(/\bmin\b/i, 'MIN')}
                </span>
                <span className="route-eta-bar__slash">/</span>
                <span className="route-eta-bar__km">{routeInfo.distanceText}</span>
              </div>
            ) : (
              <span className="route-eta-bar__muted">
                {riderPos ? '…' : 'GPS…'}
              </span>
            )}
            <button
              type="button"
              className="route-eta-bar__nav-mini"
              onClick={() => openGoogleMapsTurnByTurn(custLat!, custLng!, riderPos)}
            >
              Navigate
            </button>
          </div>
        ) : null}
      </div>

      <BottomSheetPanel title="">
        <div className="obo-sheet__badge-row">
          <span className="obo-sheet__pill">{done ? 'COMPLETED' : 'ACTIVE DELIVERY'}</span>
          <span className="obo-sheet__order-id">#{d.order_number}</span>
        </div>

        <button type="button" className="obo-sheet__back" onClick={() => nav(-1)}>
          ← Back
        </button>

        <div className="detail-head obo-sheet__head">
          <div>
            <div className="obo-sheet__customer">{d.customer_name || 'Customer'}</div>
          </div>
          {tel ? (
            <a className="obo-sheet__call" href={tel} aria-label="Call">
              <span className="obo-sheet__call-ico" />
            </a>
          ) : null}
        </div>

        <p className="obo-sheet__addr">
          <span className="obo-sheet__addr-ico" aria-hidden />
          {d.delivery_address || '—'}
        </p>
        {d.delivery_notes ? <p className="muted small">Note: {d.delivery_notes}</p> : null}

        <div className="obo-sheet__mini-grid">
          <div className="obo-sheet__mini">
            <span className="obo-sheet__mini-ico obo-sheet__mini-ico--pay" />
            <span className="obo-sheet__mini-label">Payment</span>
            <span className="obo-sheet__mini-val">{paymentLabel}</span>
          </div>
          <div className="obo-sheet__mini">
            <span className="obo-sheet__mini-ico obo-sheet__mini-ico--wt" />
            <span className="obo-sheet__mini-label">Weight</span>
            <span className="obo-sheet__mini-val">{estWeight}</span>
          </div>
        </div>

        {(d.branch_to_customer_km != null && Number.isFinite(Number(d.branch_to_customer_km))) || d.distance_km != null ? (
          <p className="detail-dist obo-sheet__dist">
            {d.branch_to_customer_km != null && Number.isFinite(Number(d.branch_to_customer_km))
              ? `Branch → customer ≈ ${Number(d.branch_to_customer_km).toFixed(2)} km`
              : `Straight-line ≈ ${d.distance_km} km`}
          </p>
        ) : null}

        <div className="obo-progress">
          <div className="obo-progress__label">{phaseLabel}</div>
          <div className="obo-progress__bar" role="status" aria-label={`Delivery progress step ${prog} of 4`}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`obo-progress__seg ${i < prog ? 'is-done' : ''}`} />
            ))}
          </div>
        </div>

        <div className="detail-items">
          <div className="detail-kicker">Items · {formatPkr(d.grand_total)}</div>
          <ul className="detail-ul">
            {d.items.map((it, i) => (
              <li key={i}>
                {it.product_name} × {it.quantity} · {formatPkr(it.subtotal)}
              </li>
            ))}
          </ul>
        </div>

        {err ? <p className="field-error">{err}</p> : null}

        <div className="status-stack">
          {showAccept ? (
            <StatusButton label="ACCEPT ORDER" disabled={busy} onClick={() => run(() => riderApi.accept(orderId))} />
          ) : null}
          {showPicked ? (
            <StatusButton label="MARK PICKED UP" disabled={busy} onClick={() => run(() => riderApi.picked(orderId))} />
          ) : null}
          {showOnWay ? (
            <StatusButton label="ON THE WAY" disabled={busy} onClick={() => run(() => riderApi.onTheWay(orderId))} />
          ) : null}
          {showDelivered ? (
            <StatusButton label="CONFIRM DELIVERY" disabled={busy} onClick={() => run(() => riderApi.delivered(orderId))} />
          ) : null}
          {done ? <p className="ok-text">Delivered. Great job.</p> : null}
        </div>
      </BottomSheetPanel>
    </div>
  );
}
