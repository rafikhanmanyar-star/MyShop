import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { riderApi, type RiderOrderBucket, type RiderOrderRow } from '../api';
import { OrderCard } from '../components/OrderCard';
import { useRider } from '../context/RiderContext';
import { useRiderWork } from '../context/RiderWorkContext';
import { useToast } from '../context/ToastContext';

const TABS: { id: RiderOrderBucket; label: string }[] = [
  { id: 'assigned', label: 'Assigned' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
];

export default function DashboardScreen() {
  const nav = useNavigate();
  const { riderName, shopSlug } = useRider();
  const {
    profile,
    profileLoading,
    online,
    setOnline,
    onlineBusy,
    deliveryFeedRevision,
    bumpDeliveryFeed,
  } = useRiderWork();
  const { showToast } = useToast();

  const [tab, setTab] = useState<RiderOrderBucket>('assigned');
  const [orders, setOrders] = useState<RiderOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [netOnline, setNetOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const up = () => setNetOnline(true);
    const down = () => setNetOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const fetchPage = useCallback(
    async (bucket: RiderOrderBucket, offset: number, append: boolean) => {
      if (!netOnline) {
        setErr('You are offline.');
        if (!append) setLoading(false);
        return;
      }
      setErr('');
      try {
        const res = await riderApi.getOrders({ bucket, limit: 30, offset });
        setHasMore(res.hasMore);
        if (append) {
          setOrders((prev) => [...prev, ...res.orders]);
        } else {
          setOrders(res.orders);
        }
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Could not load orders');
        showToast(e instanceof Error ? e.message : 'Could not load orders');
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [netOnline, showToast]
  );

  useEffect(() => {
    setLoading(true);
    void fetchPage(tab, 0, false);
  }, [tab, deliveryFeedRevision, fetchPage]);

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    void fetchPage(tab, orders.length, true);
  };

  const onAccept = async (orderId: string) => {
    try {
      await riderApi.accept(orderId);
      showToast('Accepted');
      bumpDeliveryFeed();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed');
    }
  };

  const onView = (orderId: string) => {
    nav(`/order/${orderId}`);
  };

  const busy = profile?.status === 'BUSY';
  const toggleDisabled = onlineBusy || profileLoading || busy;

  const earningsLine = useMemo(() => {
    if (tab !== 'completed' || orders.length === 0) return 'PKR —';
    const total = orders.reduce((s, o) => s + Number(o.grand_total || 0), 0);
    return `PKR ${total.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [tab, orders]);

  return (
    <div className="page dashboard-page">
      <div className="dashboard-page__hero">
        <h1 className="dashboard-page__title">MY DELIVERIES</h1>
        <p className="dashboard-page__sub">
          {riderName ? `${riderName} · ` : null}
          {shopSlug ? `Shop: ${shopSlug}` : '—'}
        </p>
        <div className="dashboard-page__toggle-row">
          <span className="dashboard-page__toggle-label">Availability</span>
          <div className="obo-seg-toggle">
            <button
              type="button"
              className={`obo-seg-toggle__btn ${online ? 'is-active' : ''}`}
              disabled={toggleDisabled}
              onClick={() => void setOnline(true)}
            >
              ONLINE
            </button>
            <button
              type="button"
              className={`obo-seg-toggle__btn ${!online ? 'is-active' : ''}`}
              disabled={toggleDisabled}
              onClick={() => void setOnline(false)}
            >
              OFFLINE
            </button>
          </div>
        </div>
      </div>

      {!netOnline ? <div className="banner banner--warn">No internet connection.</div> : null}
      {busy ? (
        <p className="dash-note">On a delivery — finish it before taking new assignments.</p>
      ) : null}

      <div className="tabs tabs--obo">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab tab--obo ${tab === t.id ? 'tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="dashboard-page__stats">
        <div className="obo-stat-card obo-stat-card--earn">
          <span className="obo-stat-card__ico" aria-hidden />
          <span className="obo-stat-card__label">EARNINGS</span>
          <span className="obo-stat-card__value">{earningsLine}</span>
        </div>
        <div className="obo-stat-card obo-stat-card--time">
          <span className="obo-stat-card__ico obo-stat-card__ico--clock" aria-hidden />
          <span className="obo-stat-card__label">ON-TIME</span>
          <span className="obo-stat-card__value">—%</span>
        </div>
      </div>

      <div className="dash-map-preview" aria-hidden>
        <div className="dash-map-preview__grid" />
        <div className="dash-map-preview__bar">
          <span className="dash-map-preview__arrow">↗</span>
          <span className="dash-map-preview__txt">Your location · live routing when you open an order</span>
          <span className="dash-map-preview__live">LIVE</span>
        </div>
      </div>

      {loading ? <p className="muted dashboard-page__loading">Loading…</p> : null}
      {err && netOnline ? <p className="field-error">{err}</p> : null}

      {!loading && !orders.length ? <p className="muted">No orders here.</p> : null}

      <div className="order-list">
        {orders.map((o) => (
          <OrderCard key={o.delivery_order_id} order={o} tab={tab} onAccept={onAccept} onView={onView} />
        ))}
      </div>

      {hasMore ? (
        <button type="button" className="btn load-more obo-load-more" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
