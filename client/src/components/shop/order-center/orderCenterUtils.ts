import type { OrderCenterListItem } from '../../../types/orderCenter';
import type { MobileOrder } from '../../../services/mobileOrdersApi';

/** Rider-assigned home delivery — dispatch/delivered via rider app */
export function isRiderFulfillmentLocked(order: Pick<MobileOrder, 'payment_method' | 'rider_id' | 'delivery_order_id'>): boolean {
    if (order.payment_method === 'SelfCollection') return false;
    return !!(order.rider_id || order.delivery_order_id);
}

export function shopCanAdvanceCartStatus(
    order: Pick<MobileOrder, 'status' | 'payment_method' | 'rider_id' | 'delivery_order_id'>,
    nextStatus: string | null | undefined
): boolean {
    if (!nextStatus) return false;
    if (['OutForDelivery', 'Delivered'].includes(nextStatus) && isRiderFulfillmentLocked(order)) {
        return false;
    }
    return true;
}

export { formatRelativeTime, formatOrderTime } from '../../../utils/orderTimeFormat';

export function cardAccentClass(item: OrderCenterListItem): string {
    if (item.status === 'Cancelled') return 'border-l-red-500';
    if (item.kind === 'voice' && !item.created_invoice_id) return 'border-l-violet-500';
    if (item.kind === 'cart' || item.converted_from_voice) return 'border-l-emerald-500';
    if (['Confirmed', 'Preparing', 'Packed'].includes(item.status)) return 'border-l-orange-500';
    if (item.status === 'Delivered') return 'border-l-green-600';
    return 'border-l-slate-300';
}

export const CART_NEXT_STATUS: Record<string, string> = {
    Pending: 'Confirmed',
    Confirmed: 'Packed',
    Packed: 'OutForDelivery',
    OutForDelivery: 'Delivered',
};

export function nextCartStatus(
    status: string,
    paymentMethod?: string
): string | null {
    if (status === 'Packed' && paymentMethod === 'SelfCollection') return 'Delivered';
    return CART_NEXT_STATUS[status] || null;
}
