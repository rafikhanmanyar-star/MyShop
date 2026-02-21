import { apiClient } from './apiClient';

export interface MobileOrder {
    id: string;
    order_number: string;
    status: string;
    subtotal: number;
    tax_total: number;
    delivery_fee: number;
    grand_total: number;
    payment_method: string;
    payment_status: string;
    delivery_address: string;
    delivery_notes?: string;
    customer_phone: string;
    customer_name: string;
    pos_synced: boolean;
    created_at: string;
    updated_at: string;
    items?: MobileOrderItem[];
    status_history?: MobileOrderStatusHistory[];
}

export interface MobileOrderItem {
    id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    discount_amount: number;
    subtotal: number;
}

export interface MobileOrderStatusHistory {
    id: string;
    from_status: string;
    to_status: string;
    changed_by: string;
    changed_by_type: string;
    note: string;
    created_at: string;
}

export interface MobileOrderingSettings {
    tenant_id: string;
    is_enabled: boolean;
    minimum_order_amount: number;
    delivery_fee: number;
    free_delivery_above: number | null;
    max_delivery_radius_km: number | null;
    auto_confirm_orders: boolean;
    order_acceptance_start: string;
    order_acceptance_end: string;
    estimated_delivery_minutes: number;
}

export interface ShopBranding {
    slug: string | null;
    logo_url: string | null;
    brand_color: string;
    company_name: string;
}

export const mobileOrdersApi = {
    // Orders
    getOrders: (status?: string) =>
        apiClient.get<MobileOrder[]>(`/shop/mobile-orders${status ? `?status=${status}` : ''}`),
    getUnsyncedOrders: () =>
        apiClient.get<MobileOrder[]>('/shop/mobile-orders/unsynced'),
    getOrder: (id: string) =>
        apiClient.get<MobileOrder>(`/shop/mobile-orders/${id}`),
    updateStatus: (id: string, status: string, note?: string) =>
        apiClient.put(`/shop/mobile-orders/${id}/status`, { status, note }),
    markSynced: (id: string) =>
        apiClient.put(`/shop/mobile-orders/${id}/synced`),

    // Settings
    getSettings: () =>
        apiClient.get<MobileOrderingSettings>('/shop/mobile-orders/settings'),
    updateSettings: (data: Partial<MobileOrderingSettings>) =>
        apiClient.put<MobileOrderingSettings>('/shop/mobile-orders/settings', data),

    // Branding
    getBranding: () =>
        apiClient.get<ShopBranding>('/shop/mobile-orders/branding'),
    updateBranding: (data: Partial<ShopBranding>) =>
        apiClient.put('/shop/mobile-orders/branding', data),

    // QR Code
    getQRCode: () =>
        apiClient.get<{ slug: string; url: string; qrData: string }>('/shop/mobile-orders/qr-code'),

    // Product mobile visibility
    updateProductMobile: (id: string, data: {
        mobile_visible?: boolean;
        mobile_price?: number | null;
        mobile_description?: string;
        mobile_sort_order?: number;
    }) => apiClient.put(`/shop/mobile-orders/products/${id}/mobile`, data),
};
