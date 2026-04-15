import { useCallback, useEffect, useState } from 'react';
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
  const { logout, riderName, shopSlug } = useRider();
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

  return (
    <div className="page dashboard">
      <header className="dash-header">
        <div>
          <h1 className="dash-header__title">My Deliveries</h1>
          <p className="dash-header__meta">
            {riderName} · {shopSlug}
          </p>
        </div>
        <div className="dash-header__actions">
          <label className="online-switch">
            <span className="online-switch__label">{online ? 'Online' : 'Offline'}</span>
            <input
              type="checkbox"
              className="online-switch__input"
              checked={online}
              disabled={toggleDisabled}
              onChange={(e) => void setOnline(e.target.checked)}
            />
          </label>
          <button type="button" className="btn btn-ghost" onClick={() => logout()}>
            Out
          </button>
        </div>
      </header>

      {!netOnline ? <div className="banner banner--warn">No internet connection.</div> : null}
      {busy ? (
        <p className="dash-note">On a delivery — finish it before taking new assignments.</p>
      ) : null}

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {err && netOnline ? <p className="field-error">{err}</p> : null}

      {!loading && !orders.length ? <p className="muted">No orders here.</p> : null}

      <div className="order-list">
        {orders.map((o) => (
          <OrderCard key={o.delivery_order_id} order={o} tab={tab} onAccept={onAccept} onView={onView} />
        ))}
      </div>

      {hasMore ? (
        <button type="button" className="btn load-more" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
