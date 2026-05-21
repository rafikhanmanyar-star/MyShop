import { apiClient } from './apiClient';

export interface VoiceOrder {
    id: string;
    order_number: string;
    customer_id: string;
    customer_name?: string;
    customer_phone?: string;
    branch_id?: string;
    branch_name?: string;
    audio_url?: string;
    audio_duration?: number;
    audio_duration_seconds?: number;
    transcription_text?: string;
    transcription_items?: { name: string; quantity: number; unit?: string }[];
    status: string;
    notes?: string;
    delivery_mode?: string;
    delivery_address?: string;
    created_invoice_id?: string;
    invoice_number?: string;
    invoice_grand_total?: number;
    mobile_order_id?: string;
    mobile_order_number?: string;
    invoice_items?: { product_name: string; product_sku?: string; quantity: number; subtotal: number }[];
    created_at: string;
    updated_at: string;
    status_history?: { to_status: string; created_at: string; note?: string }[];
}

export interface VoiceOrderSettings {
    is_enabled: boolean;
    max_recording_seconds: number;
    max_upload_bytes: number;
    transcription_enabled: boolean;
    transcription_provider: string;
    transcription_api_key_set?: boolean;
    push_enabled: boolean;
    sms_enabled: boolean;
}

export const voiceOrdersApi = {
    list: (status?: string) =>
        apiClient.get<VoiceOrder[]>(`/shop/voice-orders${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    get: (id: string) => apiClient.get<VoiceOrder>(`/shop/voice-orders/${encodeURIComponent(id)}`),
    updateStatus: (id: string, status: string, note?: string) =>
        apiClient.post(`/shop/voice-orders/${encodeURIComponent(id)}/status`, { status, note }),
    linkInvoice: (id: string, saleId: string, opts?: { createMobileOrder?: boolean; paymentMethod?: string }) =>
        apiClient.post(`/shop/voice-orders/${encodeURIComponent(id)}/link-invoice`, {
            saleId,
            ...opts,
        }),
    getSettings: () => apiClient.get<VoiceOrderSettings>('/shop/voice-orders/settings'),
    updateSettings: (data: Partial<VoiceOrderSettings & { transcription_api_key?: string }>) =>
        apiClient.put<VoiceOrderSettings>('/shop/voice-orders/settings', data),
    getAnalytics: (days?: number) =>
        apiClient.get<{
            totalVoiceOrders: number;
            conversionRate: number;
            deliveryCompletionRate: number;
            avgProcessingSeconds: number | null;
            topCustomers: { name: string; phone: string; order_count: number }[];
        }>(`/shop/voice-orders/analytics${days ? `?days=${days}` : ''}`),
};
