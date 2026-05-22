import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { riderApi, type DeliveryProofPayload } from '../api';
import { BottomSheetPanel } from '../components/BottomSheetPanel';
import { DeliveryProofSheet } from '../components/delivery/DeliveryProofSheet';
import { FailedDeliverySheet } from '../components/delivery/FailedDeliverySheet';
import { GoogleDeliveryMap, openGoogleMapsTurnByTurn, type RouteInfo } from '../components/GoogleDeliveryMap';
import { useRiderWork } from '../context/RiderWorkContext';
import { useToast } from '../context/ToastContext';
import { useOfflineStore } from '../stores/offlineStore';
import { formatPkr, isCodPayment } from '../utils/deliveryStatus';
import { whatsappCustomerUrl } from '../utils/phone';
import { Link } from 'react-router-dom';

type Detail = {
  order_id: string;
  order_number: string;
  delivery_status: string;
  accepted_at?: string | null;
  arrived_at?: string | null;
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
  items: Array<{ product_name: string; quantity: number; subtotal: number }>;
  estimated_delivery_at?: string | null;
};

export default function OrderDetailScreen() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const { refreshProfile, bumpDeliveryFeed } = useRiderWork();
  const { showToast } = useToast();
  const enqueue = useOfflineStore((s) => s.enqueue);
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [showProof, setShowProof] = useState(false);
  const [showFailed, setShowFailed] = useState(false);
  const netOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const onRouteInfo = useCallback((info: RouteInfo | null) => setRouteInfo(info), []);

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

  const run = async (fn: () => Promise<unknown>, offlineType?: Parameters<typeof enqueue>[0]['type']) => {
    setBusy(true);
    setErr('');
    try {
      if (!netOnline && offlineType && orderId) {
        enqueue({ type: offlineType, orderId });
        showToast('Queued for sync when online');
        return;
      }
      await fn();
      await refreshProfile();
      bumpDeliveryFeed();
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
      <div className="r-page">
        <div className="r-skeleton" style={{ height: 200 }} />
      </div>
    );
  }
  if (err && !d) {
    return (
      <div className="r-page">
        <p style={{ color: 'var(--r-danger)' }}>{err}</p>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="r-page">
        <p>Order not found</p>
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
  const showArrived = ds === 'ON_THE_WAY' && !d.arrived_at;
  const canComplete = ds === 'ON_THE_WAY' || ds === 'PICKED';
  const done = ds === 'DELIVERED' || ds === 'FAILED';
  const isCod = isCodPayment(d.payment_method);
  const tel =
    d.customer_phone && String(d.customer_phone).replace(/\D/g, '').length > 0
      ? `tel:${d.customer_phone}`
      : null;
  const wa = whatsappCustomerUrl(d.customer_phone);
  const canNav = custLat != null && custLng != null;

  const finishDelivery = (payload: DeliveryProofPayload) =>
    run(() => riderApi.delivered(orderId, payload), 'delivered');

  return (
    <div className="order-detail-page order-detail-page--enterprise">
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
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              right: 12,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              background: 'var(--r-surface)',
              padding: '10px 14px',
              borderRadius: 12,
              boxShadow: 'var(--r-shadow)',
            }}
          >
            <span style={{ flex: 1, fontWeight: 700 }}>
              {routeInfo ? `${routeInfo.durationText} · ${routeInfo.distanceText}` : 'Calculating route…'}
            </span>
            <button
              type="button"
              className="r-btn r-btn--accent"
              style={{ width: 'auto', minHeight: 40, padding: '8px 16px' }}
              onClick={() => openGoogleMapsTurnByTurn(custLat!, custLng!, riderPos)}
            >
              Navigate
            </button>
          </div>
        ) : null}
      </div>

      <BottomSheetPanel title="">
        <button type="button" className="r-btn r-btn--ghost" style={{ width: 'auto', marginBottom: 8 }} onClick={() => nav(-1)}>
          ← Back
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="r-badge r-badge--route">#{d.order_number}</span>
            <h2 style={{ margin: '8px 0 0', fontSize: 22 }}>{d.customer_name || 'Customer'}</h2>
          </div>
          {tel ? (
            <a href={tel} className="r-btn r-btn--accent" style={{ width: 'auto', minHeight: 44, textDecoration: 'none' }}>
              Call
            </a>
          ) : null}
        </div>
        <p style={{ color: 'var(--r-muted)', margin: '8px 0' }}>{d.delivery_address}</p>
        {d.delivery_notes ? <p style={{ fontSize: 14 }}>Note: {d.delivery_notes}</p> : null}
        {isCod ? (
          <p style={{ fontWeight: 800, color: '#c2410c', margin: '12px 0' }}>Collect {formatPkr(d.grand_total)}</p>
        ) : null}
        <Link to={`/chat/${orderId}`} className="r-btn r-btn--outline" style={{ marginBottom: 10, textDecoration: 'none', textAlign: 'center' }}>
          Chat with dispatch
        </Link>

        {!done ? (
          <div className="r-action-grid">
            {canNav ? (
              <button
                type="button"
                className="r-btn r-btn--outline"
                onClick={() => openGoogleMapsTurnByTurn(custLat!, custLng!, riderPos)}
              >
                Maps
              </button>
            ) : null}
            {wa ? (
              <a href={wa} className="r-btn r-btn--outline" style={{ textDecoration: 'none', textAlign: 'center' }}>
                WhatsApp
              </a>
            ) : null}
            {showArrived ? (
              <button
                type="button"
                className="r-btn r-btn--outline"
                disabled={busy}
                onClick={() => run(() => riderApi.arrived(orderId), 'arrived')}
              >
                Mark arrived
              </button>
            ) : null}
          </div>
        ) : null}

        {err ? <p style={{ color: 'var(--r-danger)' }}>{err}</p> : null}

        {showAccept ? (
          <button type="button" className="r-btn r-btn--primary" disabled={busy} onClick={() => run(() => riderApi.accept(orderId), 'accept')}>
            Accept order
          </button>
        ) : null}
        {showPicked ? (
          <button type="button" className="r-btn r-btn--primary" disabled={busy} onClick={() => run(() => riderApi.picked(orderId), 'picked')}>
            Picked up
          </button>
        ) : null}
        {showOnWay ? (
          <button type="button" className="r-btn r-btn--primary" disabled={busy} onClick={() => run(() => riderApi.onTheWay(orderId), 'onTheWay')}>
            On the way
          </button>
        ) : null}
        {canComplete && !done ? (
          <>
            <button type="button" className="r-btn r-btn--primary" style={{ marginTop: 10 }} disabled={busy} onClick={() => setShowProof(true)}>
              Delivered
            </button>
            <button type="button" className="r-btn r-btn--danger" style={{ marginTop: 10 }} disabled={busy} onClick={() => setShowFailed(true)}>
              Failed delivery
            </button>
          </>
        ) : null}
        {done ? <p style={{ color: 'var(--r-primary-dark)', fontWeight: 700 }}>Delivery closed.</p> : null}

        <div style={{ marginTop: 16 }}>
          <strong>Items</strong>
          <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
            {d.items.map((it, i) => (
              <li key={i}>
                {it.product_name} × {it.quantity}
              </li>
            ))}
          </ul>
        </div>
      </BottomSheetPanel>

      {showProof ? (
        <DeliveryProofSheet
          expectedCod={d.grand_total}
          isCod={isCod}
          busy={busy}
          onClose={() => setShowProof(false)}
          onConfirm={(p) => {
            setShowProof(false);
            void finishDelivery(p);
          }}
        />
      ) : null}
      {showFailed ? (
        <FailedDeliverySheet
          busy={busy}
          onClose={() => setShowFailed(false)}
          onConfirm={(p) => {
            setShowFailed(false);
            void run(() => riderApi.failed(orderId, p), 'failed');
          }}
        />
      ) : null}
    </div>
  );
}
