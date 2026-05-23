import { getDeliveryPhase, PHASE_LABELS, type DeliveryPhase } from '../../utils/deliveryStatus';
import type { RiderOrderRow } from '../../api';

const BADGE_CLASS: Record<DeliveryPhase, string> = {
  new_assignment: 'r-badge--new',
  pickup_pending: 'r-badge--pickup',
  picked_up: 'r-badge--pickup',
  en_route: 'r-badge--route',
  arrived: 'r-badge--arrived',
  delivered: 'r-badge--done',
  failed: 'r-badge--fail',
};

export function StatusBadge({ order }: { order: Pick<RiderOrderRow, 'delivery_status' | 'accepted_at'> }) {
  const phase = getDeliveryPhase(order);
  return <span className={`r-badge ${BADGE_CLASS[phase]}`}>{PHASE_LABELS[phase]}</span>;
}
