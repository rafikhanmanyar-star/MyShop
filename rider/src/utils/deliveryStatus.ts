import type { RiderOrderRow } from '../api';

export type DeliveryPhase =
  | 'pickup_pending'
  | 'picked_up'
  | 'en_route'
  | 'arrived'
  | 'delivered'
  | 'failed'
  | 'new_assignment';

export function getDeliveryPhase(order: Pick<RiderOrderRow, 'delivery_status' | 'accepted_at'>): DeliveryPhase {
  const ds = order.delivery_status;
  if (ds === 'FAILED') return 'failed';
  if (ds === 'DELIVERED') return 'delivered';
  if (ds === 'ON_THE_WAY') return 'en_route';
  if (ds === 'PICKED') return 'picked_up';
  if (ds === 'ASSIGNED' && order.accepted_at) return 'pickup_pending';
  if (ds === 'ASSIGNED') return 'new_assignment';
  return 'new_assignment';
}

export const PHASE_LABELS: Record<DeliveryPhase, string> = {
  new_assignment: 'New',
  pickup_pending: 'Pickup',
  picked_up: 'Picked up',
  en_route: 'En route',
  arrived: 'Arrived',
  delivered: 'Delivered',
  failed: 'Failed',
};

export function isCodPayment(method?: string | null): boolean {
  const pm = String(method || '').toLowerCase();
  return pm.includes('cod') || pm === 'cash' || pm === '';
}

export function formatPkr(n: number) {
  return `PKR ${Number(n).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
