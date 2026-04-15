import { apiClient } from './apiClient';

export interface MobileOrder {
    id: string;
    /** Mobile app customer record (for shop actions such as password reset). */
    customer_id?: string;
    order_number: string;
    status: string;
    subtotal: number;
    tax_total: number;
    delivery_fee: number;
    grand_total: number;
    payment_method: string;
    payment_status: string;
    delivery_address: string;
    /** Stage 3: Haversine routing metadata */
    assigned_branch_id?: string | null;
    distance_km?: number | null;
    /** Stage 5: rider assignment */
    rider_id?: string | null;
    delivery_order_id?: string | null;
    delivery_status?: string | null;
    rider_name?: string | null;
    rider_phone?: string | null;
    rider_distance_km?: number | null;
    /** Stage 8: live rider GPS + distance to drop-off (POS) */
    rider_latitude?: number | null;
    rider_longitude?: number | null;
    rider_operational_status?: 'AVAILABLE' | 'BUSY' | 'OFFLINE' | string | null;
    rider_to_dropoff_km?: number | null;
    delivery_lat?: number | null;
    delivery_lng?: number | null;
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
    logo_dark_url?: string | null;
    brand_color?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    font_family?: string;
    theme_mode?: string;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    company_name: string;
    branchId?: string | null;
    branch_name?: string | null;
    branch_location?: string | null;
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
    collectPayment: (id: string, bankAccountId: string) =>
        apiClient.put(`/shop/mobile-orders/${id}/collect-payment`, { bankAccountId }),
    markSynced: (id: string) =>
        apiClient.put(`/shop/mobile-orders/${id}/synced`),

    resetCustomerPassword: (customerId: string, newPassword: string) =>
        apiClient.put<{ success: boolean }>(`/shop/mobile-orders/customers/${encodeURIComponent(customerId)}/reset-password`, {
            newPassword,
        }),

    getPasswordResetRequests: () =>
        apiClient.get<{ id: string; phone_number: string; status: string; created_at: string }[]>(
            '/shop/mobile-orders/password-reset-requests'
        ),

    completePasswordResetRequest: (requestId: string) =>
        apiClient.post<{ success: boolean; newPassword: string; phoneE164: string }>(
            `/shop/mobile-orders/password-reset-requests/${encodeURIComponent(requestId)}/complete`,
            {}
        ),

    // Settings
    getSettings: () =>
        apiClient.get<MobileOrderingSettings>('/shop/mobile-orders/settings'),
    updateSettings: (data: Partial<MobileOrderingSettings>) =>
        apiClient.put<MobileOrderingSettings>('/shop/mobile-orders/settings', data),

    // Branding (optional branchId for per-branch slug / branding)
    getBranding: (branchId?: string | null) =>
        apiClient.get<ShopBranding>(`/shop/mobile-orders/branding${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
    updateBranding: (data: Partial<ShopBranding>) =>
        apiClient.put('/shop/mobile-orders/branding', data),

    // QR Code (optional branchId for per-branch QR at branch door)
    getQRCode: (branchId?: string | null) =>
        apiClient.get<{ slug: string; url: string; qrData: string; branchId?: string | null }>(`/shop/mobile-orders/qr-code${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),

    // Product mobile visibility
    updateProductMobile: (id: string, data: {
        mobile_visible?: boolean;
        mobile_price?: number | null;
        mobile_description?: string;
        mobile_sort_order?: number;
    }) => apiClient.put(`/shop/mobile-orders/products/${id}/mobile`, data),
};
