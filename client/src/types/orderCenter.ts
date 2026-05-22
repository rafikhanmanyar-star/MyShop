export type OrderCenterKind = 'cart' | 'voice';
export type OrderSource = 'cart' | 'voice' | 'whatsapp' | 'pos';

export type OrderCenterQueueFilter =
    | 'all'
    | 'new'
    | 'voice_pending'
    | 'preparing'
    | 'ready'
    | 'delivered'
    | 'cancelled'
    | 'unpaid';

export interface OrderCenterListItem {
    id: string;
    kind: OrderCenterKind;
    order_source: OrderSource;
    order_number: string;
    status: string;
    display_status: string;
    customer_name: string;
    customer_phone: string;
    grand_total: number;
    payment_status?: string;
    payment_method?: string;
    delivery_mode?: string;
    delivery_address?: string;
    rider_id?: string | null;
    rider_name?: string | null;
    has_audio: boolean;
    converted_from_voice: boolean;
    voice_order_id?: string;
    mobile_order_id?: string;
    created_invoice_id?: string;
    is_unread: boolean;
    priority: number;
    created_at: string;
    updated_at: string;
}

export interface OrderCenterCounts {
    all: number;
    new: number;
    voice_pending: number;
    preparing: number;
    ready: number;
    delivered: number;
    cancelled: number;
    unpaid: number;
}

export const VOICE_CANCEL_REASONS = [
    { id: 'unclear_audio', label: 'Unclear audio' },
    { id: 'out_of_service_area', label: 'Out of service area' },
    { id: 'product_unavailable', label: 'Product unavailable' },
    { id: 'fake_order', label: 'Fake order' },
    { id: 'customer_unreachable', label: 'Customer unreachable' },
    { id: 'duplicate_request', label: 'Duplicate request' },
    { id: 'other', label: 'Other' },
] as const;

export const QUEUE_FILTER_LABELS: Record<OrderCenterQueueFilter, string> = {
    all: 'All',
    new: 'New',
    voice_pending: 'Voice Pending',
    preparing: 'Preparing',
    ready: 'Ready',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    unpaid: 'Unpaid',
};

export const SOURCE_BADGE: Record<OrderSource, { label: string; className: string }> = {
    voice: { label: 'Voice', className: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200' },
    cart: { label: 'Cart', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
    whatsapp: { label: 'WhatsApp', className: 'bg-green-100 text-green-800' },
    pos: { label: 'POS', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800' },
};
