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

function formatDeliverBy(iso: string | null | undefined): string | null {
  if (iso == null || String(iso).trim() === '') return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-PK', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrderCard({ order, tab, onAccept, onView }: Props) {
  const dist =
    order.distance_km != null && Number.isFinite(Number(order.distance_km))
      ? `${Number(order.distance_km).toFixed(1)} km`
      : '—';

  const urgent =
    tab === 'assigned' &&
    order.distance_km != null &&
    Number(order.distance_km) > 0 &&
    Number(order.distance_km) < 3;

  const kindLabel = urgent ? 'URGENT DELIVERY' : 'STANDARD DELIVERY';
  const badgeLabel =
    tab === 'assigned' ? (urgent ? 'DUE SOON' : 'NEW') : order.delivery_status;

  const pkr = Number(order.grand_total || 0);
  const pkrStr = `PKR ${pkr.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className={`obo-order-card ${urgent ? 'obo-order-card--urgent' : ''}`}>
      <div className="obo-order-card__head">
        <span className={`obo-order-card__kind ${urgent ? 'is-urgent' : ''}`}>{kindLabel}</span>
        <span className={`obo-order-card__badge ${urgent ? 'is-urgent' : 'is-calm'}`}>{badgeLabel}</span>
      </div>
      <div className="obo-order-card__row">
        <div className="obo-order-card__accent" aria-hidden />
        <div className="obo-order-card__main">
          <div className="obo-order-card__id">{order.order_number}</div>
          <div className="obo-order-card__dist">{dist}</div>
        </div>
      </div>
      <div className="obo-order-card__customer">
        <span className="obo-order-card__pin" aria-hidden />
        <div>
          <div className="obo-order-card__name">{order.customer_name || 'Customer'}</div>
          <div className="obo-order-card__addr">{twoLineAddress(order.delivery_address || '')}</div>
          {(() => {
            const sched = formatDeliverBy(order.estimated_delivery_at);
            return sched ? (
            <div className="obo-order-card__sched" style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', marginTop: 6 }}>
              Deliver by {sched}
            </div>
            ) : null;
          })()}
          <div className="obo-order-card__pkr">{pkrStr}</div>
        </div>
      </div>
      <div className="obo-order-card__actions">
        {tab === 'assigned' ? (
          <>
            <button type="button" className="obo-order-card__accept" onClick={() => onAccept(order.order_id)}>
              ACCEPT TASK
            </button>
            <button type="button" className="obo-order-card__map ico-map" aria-label="Open order" onClick={() => onView(order.order_id)} />
          </>
        ) : (
          <button type="button" className="obo-order-card__view" onClick={() => onView(order.order_id)}>
            VIEW DETAILS
          </button>
        )}
      </div>
    </div>
  );
}
