import { apiClient } from './apiClient';

export type FeedbackStatus = 'submitted' | 'under_review' | 'responded' | 'resolved';
export type FeedbackPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CustomerFeedbackItem {
    id: string;
    feedback_type: string;
    message: string;
    status: FeedbackStatus;
    priority: FeedbackPriority;
    severity_score: number;
    customer_id: string;
    customer_name?: string;
    customer_phone?: string;
    order_id?: string | null;
    created_at: string;
    updated_at: string;
    overall_rating?: number | null;
    delivery_rating?: number | null;
    product_quality_rating?: number | null;
    product_request?: {
        product_name?: string;
        brand?: string;
        category?: string;
        notes?: string;
        barcode?: string;
    } | null;
    attachments?: { id: string; url: string; kind: string }[];
    replies?: {
        id: string;
        author_type: string;
        author_name?: string;
        message: string;
        is_thank_you: boolean;
        created_at: string;
    }[];
    reply_count?: number;
    demand_count?: number;
}

export const customerFeedbackApi = {
    list: (params?: Record<string, string | number | undefined>) => {
        const q = new URLSearchParams();
        Object.entries(params || {}).forEach(([k, v]) => {
            if (v !== undefined && v !== '') q.set(k, String(v));
        });
        const qs = q.toString();
        return apiClient.get<{ items: CustomerFeedbackItem[]; total: number }>(
            `/shop/customer-feedback${qs ? `?${qs}` : ''}`
        );
    },
    get: (id: string) => apiClient.get<CustomerFeedbackItem>(`/shop/customer-feedback/${encodeURIComponent(id)}`),
    reply: (id: string, body: { message: string; isThankYou?: boolean; status?: FeedbackStatus; priority?: FeedbackPriority }) =>
        apiClient.post<CustomerFeedbackItem>(`/shop/customer-feedback/${encodeURIComponent(id)}/reply`, body),
    update: (id: string, body: { status?: FeedbackStatus; priority?: FeedbackPriority }) =>
        apiClient.patch<CustomerFeedbackItem>(`/shop/customer-feedback/${encodeURIComponent(id)}`, body),
    stats: () => apiClient.get<Record<string, number>>('/shop/customer-feedback/stats'),
    analytics: () =>
        apiClient.get<{
            topProducts: Array<{
                product_name: string;
                brand?: string;
                request_count: number;
                customer_count: number;
                high_demand: boolean;
            }>;
            trendingBrands: Array<{ brand: string; request_count: number }>;
            summary: { total_requests: number; high_demand_count: number };
        }>('/shop/customer-feedback/analytics/product-requests'),
    uploadAttachment: async (file: File) => {
        const form = new FormData();
        form.append('image', file);
        const token = localStorage.getItem('token');
        const res = await fetch('/api/shop/customer-feedback/upload-attachment', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        return data as { url: string };
    },
};
