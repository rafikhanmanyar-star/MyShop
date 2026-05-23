import { useQuery } from '@tanstack/react-query';
import { riderApi } from '../api';
import { formatPkr } from '../utils/deliveryStatus';
import { useRiderWork } from '../context/RiderWorkContext';

export default function CashScreen() {
  const { deliveryFeedRevision } = useRiderWork();
  const { data, isLoading } = useQuery({
    queryKey: ['rider-cash', deliveryFeedRevision],
    queryFn: () => riderApi.getCashSummary(),
  });

  return (
    <div className="r-page">
      <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>Cash collection</h2>
      <div className="r-stat-grid">
        <div className="r-stat-card">
          <div className="r-stat-card__label">Pending COD</div>
          <div className="r-stat-card__value">{formatPkr(data?.cod_pending ?? 0)}</div>
        </div>
        <div className="r-stat-card">
          <div className="r-stat-card__label">Collected today</div>
          <div className="r-stat-card__value">{formatPkr(data?.cod_collected_today ?? 0)}</div>
        </div>
      </div>
      <p style={{ fontSize: 14, color: 'var(--r-muted)' }}>
        Hand over collected cash to dispatch at end of shift. Partial collections are recorded per order.
      </p>
      {isLoading ? <div className="r-skeleton" style={{ height: 80 }} /> : null}
      {(data?.orders ?? []).map((o) => (
        <div key={o.order_id} className="r-card" style={{ marginBottom: 10 }}>
          <strong>#{o.order_number}</strong>
          <div style={{ fontSize: 14, color: 'var(--r-muted)', marginTop: 4 }}>
            {o.status} · Expected {formatPkr(o.expected)}
            {o.collected != null ? ` · Collected ${formatPkr(o.collected)}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
