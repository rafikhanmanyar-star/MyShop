import type { RiderOrderBucket, RiderOrderRow } from '../api';

type Props = {
  order: RiderOrderRow;
  tab: RiderOrderBucket;
  onAccept: (orderId: string) => void;
  onView: (orderId: string) => void;
};

function twoLineAddress(addr: string) {
  const t = (addr || '—').trim();
  if (t.length <= 72) return t;
  return `${t.slice(0, 70)}…`;
}

export function OrderCard({ order, tab, onAccept, onView }: Props) {
  const dist =
    order.distance_km != null && Number.isFinite(Number(order.distance_km))
      ? `${Number(order.distance_km).toFixed(1)} km`
      : '—';

  return (
    <div className="order-card card">
      <div className="order-card__top">
        <div>
          <div className="order-card__id">{order.order_number}</div>
          <div className="order-card__name">{order.customer_name || 'Customer'}</div>
        </div>
        <span className="badge">{order.delivery_status}</span>
      </div>
      <p className="order-card__addr">{twoLineAddress(order.delivery_address || '')}</p>
      <div className="order-card__meta">
        <span className="order-card__dist">{dist}</span>
        {tab === 'assigned' ? (
          <button type="button" className="btn btn-primary order-card__action" onClick={() => onAccept(order.order_id)}>
            Accept
          </button>
        ) : (
          <button type="button" className="btn btn-primary order-card__action" onClick={() => onView(order.order_id)}>
            View
          </button>
        )}
      </div>
    </div>
  );
}
