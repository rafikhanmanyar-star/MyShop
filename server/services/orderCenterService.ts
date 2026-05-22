import { getDatabaseService } from './databaseService.js';
import { getMobileOrderService } from './mobileOrderService.js';
import { getVoiceOrderService } from './voiceOrderService.js';
import { toApiInstant } from '../utils/apiTimestamps.js';

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

const VOICE_ACTIVE = new Set(['Pending', 'Received', 'Preparing', 'InvoiceCreated', 'Accepted', 'OutForDelivery']);
const CART_ACTIVE = new Set(['Pending', 'Confirmed', 'Packed', 'OutForDelivery']);

function mapVoiceDisplayStatus(status: string, hasInvoice: boolean): string {
    if (status === 'Cancelled') return 'Cancelled';
    if (status === 'Delivered') return 'Delivered';
    if (!hasInvoice && ['Pending', 'Received'].includes(status)) return 'Voice Pending';
    if (status === 'InvoiceCreated') return 'Awaiting customer';
    if (status === 'Preparing') return 'Reviewing';
    if (['Accepted', 'OutForDelivery'].includes(status)) return 'Converted';
    return status;
}

function mapCartDisplayStatus(status: string): string {
    const map: Record<string, string> = {
        Pending: 'New',
        Confirmed: 'Preparing',
        Packed: 'Ready',
        OutForDelivery: 'Out for Delivery',
        Delivered: 'Delivered',
        Cancelled: 'Cancelled',
    };
    return map[status] || status;
}

function matchesQueueFilter(item: OrderCenterListItem, filter: OrderCenterQueueFilter): boolean {
    if (filter === 'all') return item.status !== 'Cancelled';
    if (filter === 'cancelled') return item.status === 'Cancelled';
    if (item.status === 'Cancelled') return false;
    switch (filter) {
        case 'new':
            return (
                (item.kind === 'cart' && item.status === 'Pending') ||
                (item.kind === 'voice' && ['Pending', 'Received'].includes(item.status))
            );
        case 'voice_pending':
            return item.kind === 'voice' && VOICE_ACTIVE.has(item.status) && !item.created_invoice_id;
        case 'preparing':
            return (
                (item.kind === 'cart' && item.status === 'Confirmed') ||
                (item.kind === 'voice' && ['Preparing', 'InvoiceCreated'].includes(item.status))
            );
        case 'ready':
            return item.kind === 'cart' && item.status === 'Packed';
        case 'delivered':
            return item.status === 'Delivered';
        case 'unpaid':
            return item.kind === 'cart' && item.status === 'Delivered' && item.payment_status === 'Unpaid';
        default:
            return true;
    }
}

function voicePriority(status: string): number {
    if (status === 'Pending' || status === 'Received') return 3;
    if (status === 'Preparing' || status === 'InvoiceCreated') return 2;
    return 1;
}

function cartPriority(status: string): number {
    if (status === 'Pending') return 3;
    if (status === 'Confirmed') return 2;
    if (status === 'Packed' || status === 'OutForDelivery') return 2;
    return 1;
}

export class OrderCenterService {
    private db = getDatabaseService();

    async listQueue(
        tenantId: string,
        opts: {
            filter?: OrderCenterQueueFilter;
            search?: string;
            deliveryType?: string;
            riderId?: string;
            dateFrom?: string;
            dateTo?: string;
            includeCancelled?: boolean;
            limit?: number;
        } = {}
    ): Promise<{ items: OrderCenterListItem[]; counts: OrderCenterCounts }> {
        const filter = opts.filter || 'all';
        const includeCancelled = opts.includeCancelled ?? filter === 'cancelled';
        const search = (opts.search || '').trim().toLowerCase();

        const mobileSvc = getMobileOrderService();
        const voiceSvc = getVoiceOrderService();

        const [cartRows, voiceResult] = await Promise.all([
            mobileSvc.getMobileOrdersForPOS(tenantId),
            voiceSvc.listOrders(tenantId, { limit: 200 }),
        ]);

        const voiceRows = voiceResult.items as Record<string, unknown>[];

        const items: OrderCenterListItem[] = [];

        for (const o of cartRows as Record<string, unknown>[]) {
            const id = String(o.id);
            const status = String(o.status);
            const source = (String(o.order_source || 'cart') as OrderSource) || 'cart';
            const converted = !!o.converted_from_voice_order_id;
            items.push({
                id,
                kind: 'cart',
                order_source: converted ? 'voice' : source,
                order_number: String(o.order_number),
                status,
                display_status: mapCartDisplayStatus(status),
                customer_name: String(o.customer_name || ''),
                customer_phone: String(o.customer_phone || ''),
                grand_total: Number(o.grand_total) || 0,
                payment_status: String(o.payment_status || ''),
                payment_method: String(o.payment_method || ''),
                delivery_mode: o.payment_method === 'SelfCollection' ? 'pickup' : 'delivery',
                delivery_address: o.delivery_address as string | undefined,
                rider_id: o.rider_id as string | null,
                rider_name: o.rider_name as string | null,
                has_audio: false,
                converted_from_voice: converted,
                voice_order_id: o.converted_from_voice_order_id as string | undefined,
                created_at: toApiInstant(o.created_at),
                updated_at: toApiInstant(o.updated_at),
                is_unread: status === 'Pending',
                priority: cartPriority(status),
            });
        }

        for (const v of voiceRows) {
            const status = String(v.status);
            if (!includeCancelled && status === 'Cancelled') continue;
            if (v.mobile_order_id) continue;
            const hasInvoice = !!v.created_invoice_id;
            items.push({
                id: String(v.id),
                kind: 'voice',
                order_source: 'voice',
                order_number: String(v.order_number),
                status,
                display_status: mapVoiceDisplayStatus(status, hasInvoice),
                customer_name: String(v.customer_name || ''),
                customer_phone: String(v.customer_phone || ''),
                grand_total: Number(v.invoice_grand_total) || 0,
                delivery_mode: String(v.delivery_mode || 'delivery'),
                delivery_address: v.delivery_address as string | undefined,
                has_audio: !!v.audio_url,
                converted_from_voice: false,
                created_invoice_id: v.created_invoice_id as string | undefined,
                mobile_order_id: v.mobile_order_id as string | undefined,
                created_at: toApiInstant(v.created_at),
                updated_at: toApiInstant(v.updated_at),
                is_unread: ['Pending', 'Received'].includes(status),
                priority: voicePriority(status),
            });
        }

        let filtered = items;
        if (filter !== 'all') {
            filtered = items.filter((i) => matchesQueueFilter(i, filter));
        } else {
            filtered = items.filter((i) => i.status !== 'Cancelled');
        }

        if (search) {
            filtered = filtered.filter(
                (i) =>
                    i.order_number.toLowerCase().includes(search) ||
                    i.customer_name.toLowerCase().includes(search) ||
                    i.customer_phone.includes(search)
            );
        }

        if (opts.deliveryType) {
            const dt = opts.deliveryType.toLowerCase();
            filtered = filtered.filter((i) => (i.delivery_mode || 'delivery').toLowerCase() === dt);
        }

        if (opts.riderId) {
            filtered = filtered.filter((i) => i.rider_id === opts.riderId);
        }

        filtered.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        const limit = Math.min(opts.limit || 150, 300);
        const slice = filtered.slice(0, limit);

        const counts: OrderCenterCounts = {
            all: items.filter((i) => i.status !== 'Cancelled').length,
            new: items.filter((i) => matchesQueueFilter(i, 'new')).length,
            voice_pending: items.filter((i) => matchesQueueFilter(i, 'voice_pending')).length,
            preparing: items.filter((i) => matchesQueueFilter(i, 'preparing')).length,
            ready: items.filter((i) => matchesQueueFilter(i, 'ready')).length,
            delivered: items.filter((i) => matchesQueueFilter(i, 'delivered')).length,
            cancelled: items.filter((i) => i.status === 'Cancelled').length,
            unpaid: items.filter((i) => matchesQueueFilter(i, 'unpaid')).length,
        };

        return { items: slice, counts };
    }

    async getDetail(tenantId: string, kind: OrderCenterKind, orderId: string) {
        if (kind === 'cart') {
            const order = await getMobileOrderService().getOrderDetail(tenantId, orderId);
            if (!order) return null;
            return { kind: 'cart' as const, order };
        }
        const order = await getVoiceOrderService().getOrderById(tenantId, orderId);
        if (!order) return null;
        return { kind: 'voice' as const, order };
    }

    async getCustomerHistory(tenantId: string, customerId: string, limit = 10) {
        const rows = await this.db.query(
            `SELECT id, order_number, status, grand_total, payment_status, created_at, 'cart' AS kind
             FROM mobile_orders WHERE tenant_id = $1 AND customer_id = $2
             UNION ALL
             SELECT id, order_number, status, 0 AS grand_total, NULL AS payment_status, created_at, 'voice' AS kind
             FROM voice_orders WHERE tenant_id = $1 AND customer_id = $2
             ORDER BY created_at DESC LIMIT $3`,
            [tenantId, customerId, limit]
        );
        const spend = await this.db.query(
            `SELECT COALESCE(SUM(grand_total), 0) AS total FROM mobile_orders
             WHERE tenant_id = $1 AND customer_id = $2 AND status = 'Delivered'`,
            [tenantId, customerId]
        );
        const cancelCount = await this.db.query(
            `SELECT COUNT(*) AS c FROM mobile_orders WHERE tenant_id = $1 AND customer_id = $2 AND status = 'Cancelled'
             UNION ALL
             SELECT COUNT(*) FROM voice_orders WHERE tenant_id = $1 AND customer_id = $2 AND status = 'Cancelled'`,
            [tenantId, customerId]
        );
        let cancelled = 0;
        for (const r of cancelCount) cancelled += Number((r as { c?: number }).c) || 0;
        return {
            previous_orders: (rows as { created_at?: unknown }[]).map((r) => ({
                ...r,
                created_at: toApiInstant(r.created_at),
            })),
            total_spending: Number(spend[0]?.total) || 0,
            cancel_count: cancelled,
            last_order_at: rows[0]?.created_at ? toApiInstant(rows[0].created_at) : null,
        };
    }
}

let instance: OrderCenterService | null = null;

export function getOrderCenterService(): OrderCenterService {
    if (!instance) instance = new OrderCenterService();
    return instance;
}
