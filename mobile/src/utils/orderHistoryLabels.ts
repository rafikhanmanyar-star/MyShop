/** Unified customer order history — channel tags and status copy. */

export type OrderChannel = 'cart' | 'voice';

export interface OrderHistoryRow {
    id: string;
    order_number?: string;
    status: string;
    order_channel?: OrderChannel;
    order_type?: string;
    detail_kind?: 'voice' | 'cart';
    detail_id?: string;
    voice_order_id?: string | null;
    payment_method?: string;
    grand_total?: number | string | null;
    estimated_delivery_at?: string;
    delivery_order_id?: string;
    delivery_status?: string;
    rider_name?: string;
    created_at: string;
}

export function orderChannel(row: OrderHistoryRow): OrderChannel {
    if (row.order_channel === 'voice' || row.order_type === 'voice') return 'voice';
    return 'cart';
}

export function orderDetailPath(shopSlug: string, row: OrderHistoryRow): string {
    const kind = row.detail_kind ?? (orderChannel(row) === 'voice' && !row.delivery_order_id ? 'voice' : 'cart');
    if (kind === 'voice') {
        const vid = row.voice_order_id || row.detail_id || row.id;
        return `/${shopSlug}/voice-orders/${vid}`;
    }
    return `/${shopSlug}/orders/${row.detail_id || row.id}`;
}

const MOBILE_STATUS: Record<string, string> = {
    Pending: 'Order placed',
    Confirmed: 'Confirmed',
    Packed: 'Packed',
    OutForDelivery: 'Out for delivery',
    Delivered: 'Delivered',
    Cancelled: 'Cancelled',
    AwaitingShop: 'Awaiting shop',
    InvoiceCreated: 'Approve invoice',
};

const VOICE_STATUS: Record<string, string> = {
    Pending: 'Awaiting shop',
    Received: 'Received by shop',
    Preparing: 'Shop preparing',
    InvoiceCreated: 'Approve invoice',
    Accepted: 'Confirmed',
    Rejected: 'Rejected',
    OutForDelivery: 'Out for delivery',
    Delivered: 'Delivered',
    Cancelled: 'Cancelled',
};

export function orderStatusLabel(row: OrderHistoryRow): string {
    const ch = orderChannel(row);
    const s = row.status;
    if (ch === 'voice') return VOICE_STATUS[s] || MOBILE_STATUS[s] || s;
    return MOBILE_STATUS[s] || s;
}

export function orderChannelLabel(ch: OrderChannel): string {
    return ch === 'voice' ? 'Voice' : 'Cart';
}

export function statusBadgeClass(status: string): string {
    if (status === 'AwaitingShop' || status === 'Pending') return 'status-Pending';
    if (status === 'InvoiceCreated') return 'status-Confirmed';
    if (status === 'Received' || status === 'Preparing') return 'status-Confirmed';
    return `status-${status}`;
}
