import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { riderApi } from '../api';
import { DashboardHero } from '../components/dashboard/DashboardHero';
import { QuickActions } from '../components/dashboard/QuickActions';
import { SummaryCards } from '../components/dashboard/SummaryCards';
import { useRiderWork } from '../context/RiderWorkContext';

export default function HomeScreen() {
  const { deliveryFeedRevision } = useRiderWork();
  const netOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const { data: summary, isLoading } = useQuery({
    queryKey: ['rider-summary', deliveryFeedRevision],
    queryFn: () => riderApi.getSummary(),
    enabled: netOnline,
  });

  const { data: activeOrders } = useQuery({
    queryKey: ['rider-active-one', deliveryFeedRevision],
    queryFn: () => riderApi.getOrders({ bucket: 'active', limit: 1 }),
    enabled: netOnline,
  });

  const activeOrderId = useMemo(
    () => activeOrders?.orders?.[0]?.order_id ?? null,
    [activeOrders]
  );

  return (
    <div className="r-page">
      {!netOnline ? <div className="r-banner r-banner--offline">Offline — cached data may be stale</div> : null}
      <DashboardHero summary={summary ?? null} />
      {isLoading ? (
        <div className="r-skeleton" style={{ height: 120, marginBottom: 16 }} />
      ) : (
        <SummaryCards summary={summary ?? null} />
      )}
      <QuickActions activeOrderId={activeOrderId} />
    </div>
  );
}
