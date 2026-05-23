import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { riderApi, type RiderOrderBucket } from '../api';
import { QueueOrderCard } from '../components/queue/QueueOrderCard';
import { useRiderWork } from '../context/RiderWorkContext';
import { useToast } from '../context/ToastContext';
import { useOfflineStore } from '../stores/offlineStore';
import { flushOfflineQueue } from '../lib/offlineSync';

const TABS: { id: RiderOrderBucket; label: string }[] = [
  { id: 'assigned', label: 'New' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Done' },
];

export default function QueueScreen() {
  const nav = useNavigate();
  const [tab, setTab] = useState<RiderOrderBucket>('active');
  const { deliveryFeedRevision, bumpDeliveryFeed } = useRiderWork();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const enqueue = useOfflineStore((s) => s.enqueue);
  const netOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const { data, isLoading, error } = useQuery({
    queryKey: ['rider-orders', tab, deliveryFeedRevision],
    queryFn: () => riderApi.getOrders({ bucket: tab, limit: 40 }),
    placeholderData: () => {
      const cached = useOfflineStore.getState().getCachedOrders(tab);
      return cached as { orders: []; hasMore: false } | undefined;
    },
  });

  const onAccept = async (orderId: string) => {
    try {
      if (!netOnline) {
        enqueue({ type: 'accept', orderId });
        showToast('Saved offline — will sync when online');
        return;
      }
      await riderApi.accept(orderId);
      showToast('Accepted');
      bumpDeliveryFeed();
      void queryClient.invalidateQueries({ queryKey: ['rider-orders'] });
      void flushOfflineQueue();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed');
    }
  };

  const orders = data?.orders ?? [];

  return (
    <div className="r-page">
      <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 800 }}>Delivery queue</h2>
      <div className="r-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`r-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {!netOnline ? <div className="r-banner r-banner--warn">Offline mode</div> : null}
      {isLoading ? <div className="r-skeleton" style={{ height: 100, marginBottom: 12 }} /> : null}
      {error ? <p style={{ color: 'var(--r-danger)' }}>{(error as Error).message}</p> : null}
      {!isLoading && !orders.length ? (
        <p style={{ color: 'var(--r-muted)', textAlign: 'center', padding: 32 }}>No orders in this queue</p>
      ) : null}
      {orders.map((o) => (
        <QueueOrderCard
          key={o.delivery_order_id}
          order={o}
          tab={tab}
          onOpen={(id) => nav(`/order/${id}`)}
          onAccept={tab === 'assigned' ? onAccept : undefined}
        />
      ))}
    </div>
  );
}
