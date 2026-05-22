import { apiClient } from './apiClient';
import type {
    OrderCenterCounts,
    OrderCenterKind,
    OrderCenterListItem,
    OrderCenterQueueFilter,
} from '../types/orderCenter';
import type { MobileOrder } from './mobileOrdersApi';
import type { VoiceOrder } from './voiceOrdersApi';

export interface OrderCenterQueueResponse {
    items: OrderCenterListItem[];
    counts: OrderCenterCounts;
}

export type OrderCenterDetail =
    | { kind: 'cart'; order: MobileOrder }
    | { kind: 'voice'; order: VoiceOrder };

export const orderCenterApi = {
    getQueue: (params?: {
        filter?: OrderCenterQueueFilter;
        search?: string;
        deliveryType?: string;
        riderId?: string;
        includeCancelled?: boolean;
    }) => {
        const q = new URLSearchParams();
        if (params?.filter) q.set('filter', params.filter);
        if (params?.search) q.set('search', params.search);
        if (params?.deliveryType) q.set('deliveryType', params.deliveryType);
        if (params?.riderId) q.set('riderId', params.riderId);
        if (params?.includeCancelled) q.set('includeCancelled', 'true');
        const qs = q.toString();
        return apiClient.get<OrderCenterQueueResponse>(`/shop/order-center/queue${qs ? `?${qs}` : ''}`);
    },

    getDetail: (kind: OrderCenterKind, id: string) =>
        apiClient.get<OrderCenterDetail>(`/shop/order-center/${kind}/${encodeURIComponent(id)}`),

    updateCartStatus: (id: string, status: string, note?: string) =>
        apiClient.put<MobileOrder>(`/shop/order-center/cart/${encodeURIComponent(id)}/status`, { status, note }),

    updateVoiceStatus: (id: string, status: string, note?: string) =>
        apiClient.post<VoiceOrder>(`/shop/order-center/voice/${encodeURIComponent(id)}/status`, { status, note }),

    cancelVoiceOrder: (
        id: string,
        body: { reason: string; note?: string; notifyCustomer?: boolean }
    ) => apiClient.post<VoiceOrder>(`/shop/order-center/voice/${encodeURIComponent(id)}/cancel`, body),

    linkVoiceInvoice: (
        id: string,
        saleId: string,
        opts?: { createMobileOrder?: boolean; paymentMethod?: string }
    ) =>
        apiClient.post<VoiceOrder>(`/shop/order-center/voice/${encodeURIComponent(id)}/link-invoice`, {
            saleId,
            ...opts,
        }),

    assignRider: (orderId: string, riderId: string) =>
        apiClient.post(`/shop/order-center/cart/${encodeURIComponent(orderId)}/assign-rider`, { riderId }),

    collectCartPayment: (
        orderId: string,
        body: { bankAccountId?: string; paymentType?: 'bank' | 'khata' }
    ) => apiClient.put(`/shop/order-center/cart/${encodeURIComponent(orderId)}/collect-payment`, body),

    getChatMessages: (orderId: string) =>
        apiClient.get<{ messages: Array<{ id: string; sender_role: string; body: string; created_at: string }> }>(
            `/shop/order-center/cart/${encodeURIComponent(orderId)}/chat`
        ),

    sendChatMessage: (orderId: string, body: string) =>
        apiClient.post(`/shop/order-center/cart/${encodeURIComponent(orderId)}/chat`, { body }),

    getRidersLiveLocations: () =>
        apiClient.get<{
            riders: Array<{
                id: string;
                name: string;
                status: string;
                latitude: number;
                longitude: number;
            }>;
        }>('/shop/order-center/riders/live-locations'),

    getFleetRiderAnalytics: (days = 7) =>
        apiClient.get<{ period_days: number; riders: Array<{ id: string; name: string; status: string; deliveries: number; completed: number }> }>(
            `/shop/order-center/riders/analytics?days=${days}`
        ),

    getCustomerHistory: (customerId: string) =>
        apiClient.get<{
            previous_orders: { id: string; order_number: string; status: string; grand_total: number; created_at: string; kind: string }[];
            total_spending: number;
            cancel_count: number;
            last_order_at: string | null;
        }>(`/shop/order-center/customers/${encodeURIComponent(customerId)}/history`),
};
