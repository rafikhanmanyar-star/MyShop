import type { RiderOrderBucket, RiderOrderRow } from '../../api';
import { formatPkr, isCodPayment } from '../../utils/deliveryStatus';
import { StatusBadge } from '../ui/StatusBadge';

type Props = {
  order: RiderOrderRow;
  tab: RiderOrderBucket;
  onOpen: (orderId: string) => void;
  onAccept?: (orderId: string) => void;
};

export function QueueOrderCard({ order, tab, onOpen, onAccept }: Props) {
  const isCod = isCodPayment(order.payment_method);
  const showAccept = tab === 'assigned' && order.delivery_status === 'ASSIGNED' && !order.accepted_at;

  return (
    <article className="r-queue-card" onClick={() => onOpen(order.order_id)} role="button" tabIndex={0}>
      <div className="r-queue-card__head">
        <div>
          <h3 className="r-queue-card__title">{order.customer_name || 'Customer'}</h3>
          <span style={{ fontSize: 13, color: 'var(--r-muted)' }}>#{order.order_number}</span>
        </div>
        <StatusBadge order={order} />
      </div>
      <p className="r-queue-card__addr">{order.delivery_address || 'No address'}</p>
      <div className="r-queue-card__meta">
        {order.distance_km != null ? <span>📍 {order.distance_km} km</span> : null}
        {order.item_count != null ? <span>📦 {order.item_count} items</span> : null}
        {isCod ? <span className="r-badge r-badge--cod">{formatPkr(order.grand_total)} COD</span> : null}
      </div>
      {showAccept && onAccept ? (
        <button
          type="button"
          className="r-btn r-btn--primary"
          style={{ marginTop: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            onAccept(order.order_id);
          }}
        >
          Accept delivery
        </button>
      ) : null}
    </article>
  );
}
