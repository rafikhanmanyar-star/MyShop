function getApiBaseUrl(): string {
    const env = import.meta.env.VITE_API_URL as string | undefined;
    if (env) {
        return env.endsWith('/api') ? env : env.replace(/\/?$/, '') + '/api';
    }
    return '/api';
}

const API_BASE = `${getApiBaseUrl()}/mobile`;

async function request(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem('mobile_token');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
}

// ─── Public (shop slug) ─────────────────────────────
export const publicApi = {
    discover: () => request(`${API_BASE}/discover`),
    getShopInfo: (slug: string) => request(`${API_BASE}/${slug}/info`),
    getCategories: (slug: string) => request(`${API_BASE}/${slug}/categories`),
    getProducts: (slug: string, params: Record<string, string> = {}) => {
        const qs = new URLSearchParams(params).toString();
        return request(`${API_BASE}/${slug}/products${qs ? `?${qs}` : ''}`);
    },
    getProduct: (slug: string, id: string) => request(`${API_BASE}/${slug}/products/${id}`),
};

// ─── Auth ─────────────────────────────────────────────
export const authApi = {
    register: (phone: string, password: string, name: string, addressLine1: string, shopSlug: string) =>
        request(`${API_BASE}/auth/register`, {
            method: 'POST',
            body: JSON.stringify({ phone, password, name, addressLine1, shopSlug }),
        }),
    login: (phone: string, password: string, shopSlug: string) =>
        request(`${API_BASE}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ phone, password, shopSlug }),
        }),
};

// ─── Customer (authenticated) ────────────────────────
export const customerApi = {
    getProfile: () => request(`${API_BASE}/profile`),
    updateProfile: (data: any) =>
        request(`${API_BASE}/profile`, { method: 'PUT', body: JSON.stringify(data) }),
    placeOrder: (data: any) =>
        request(`${API_BASE}/orders`, { method: 'POST', body: JSON.stringify(data) }),
    getOrders: (cursor?: string) =>
        request(`${API_BASE}/orders${cursor ? `?cursor=${cursor}` : ''}`),
    getOrder: (id: string) => request(`${API_BASE}/orders/${id}`),
    cancelOrder: (id: string, reason?: string) =>
        request(`${API_BASE}/orders/${id}/cancel`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
        }),
};
