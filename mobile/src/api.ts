/** Keep in sync with client/src/config/apiUrl.ts so API + image URLs resolve the same way. */
const API_PORT = 3000;

export function getApiBaseUrl(): string {
    const env = import.meta.env.VITE_API_URL as string | undefined;

    if (typeof window !== 'undefined') {
        const { protocol, hostname } = window.location;
        const isElectron = protocol === 'file:' || !hostname;
        const isDevServer = import.meta.env.DEV && !isElectron;

        // Dev: relative /api so Vite proxies /api and /uploads to the backend
        if (isDevServer) {
            return '/api';
        }

        if (env) {
            return env.endsWith('/api') ? env : env.replace(/\/?$/, '') + '/api';
        }

        if (isElectron) {
            return `http://localhost:${API_PORT}/api`;
        }

        // Production without env: assume API on same host (or localhost:3000 in dev-like setups)
        return `${protocol}//${hostname}${hostname === 'localhost' ? `:${API_PORT}` : ''}/api`;
    }

    if (env) {
        return env.endsWith('/api') ? env : env.replace(/\/?$/, '') + '/api';
    }

    return `http://localhost:${API_PORT}/api`;
}

export function getBaseUrl(): string {
    const url = getApiBaseUrl();
    return url.replace(/\/api$/, '');
}

export function getFullImageUrl(path: string | undefined): string | undefined {
    if (!path) return undefined;
    const raw = String(path).trim();
    if (!raw) return undefined;
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:') || raw.startsWith('blob:')) {
        return raw;
    }

    const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;

    // Prefer API origin from VITE_API_URL so /uploads/* resolves when the PWA is on a different host than the API (e.g. Render static + API).
    const envApi = import.meta.env.VITE_API_URL as string | undefined;
    if (envApi && typeof envApi === 'string') {
        const origin = envApi.replace(/\/?api\/?$/i, '').replace(/\/$/, '');
        if (origin) return `${origin}${cleanPath}`;
    }

    const base = getBaseUrl();
    const cleanBase = base === '/' ? '' : base;
    return `${cleanBase}${cleanPath}`;
}

/** Product image path from API (supports both snake_case and camelCase). */
export function getProductImagePath(product: { image_url?: string | null; imageUrl?: string | null } | undefined): string | undefined {
    if (!product) return undefined;
    const path = product.image_url ?? product.imageUrl;
    return path && String(path).trim() ? String(path).trim() : undefined;
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
    getProducts: (slug: string, params: Record<string, any> = {}) => {
        const query = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                value.forEach(v => query.append(`${key}[]`, v));
            } else if (value !== undefined && value !== null && value !== '') {
                query.append(key, value.toString());
            }
        });
        const qs = query.toString();
        return request(`${API_BASE}/${slug}/products${qs ? `?${qs}` : ''}`);
    },
    getProduct: (slug: string, id: string) => request(`${API_BASE}/${slug}/products/${id}`),
    getOffers: (slug: string) => request(`${API_BASE}/${slug}/offers`),
    getOffer: (slug: string, offerId: string) => request(`${API_BASE}/${slug}/offers/${offerId}`),
    getBrands: (slug: string) => request(`${API_BASE}/${slug}/brands`),
    getBranding: (slug: string) => request(`${API_BASE}/${slug}/branding`),
    /** Create product/SKU (used when syncing offline-created products; requires backend POST /api/mobile/:shopSlug/products) */
    createProduct: (slug: string, data: Record<string, unknown>) =>
        request(`${API_BASE}/${slug}/products`, { method: 'POST', body: JSON.stringify(data) }),
    /** Upload product image (for syncing offline-created product images to cloud) */
    uploadImage: async (slug: string, file: File): Promise<{ imageUrl: string }> => {
        const formData = new FormData();
        formData.append('image', file);
        const token = localStorage.getItem('mobile_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${getApiBaseUrl()}/mobile/${slug}/upload-image`, { method: 'POST', body: formData, headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        return data;
    },
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
    getBranches: () => request(`${API_BASE}/branches`),
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
    getBudgets: () => request(`${API_BASE}/budgets`),
    getBudget: (id: string) => request(`${API_BASE}/budgets/${id}`),
    getBudgetSummary: (month?: number, year?: number) => {
        const params = new URLSearchParams();
        if (month) params.append('month', month.toString());
        if (year) params.append('year', year.toString());
        const qs = params.toString();
        return request(`${API_BASE}/budget-summary${qs ? `?${qs}` : ''}`);
    },
    createBudget: (data: any) =>
        request(`${API_BASE}/budgets`, { method: 'POST', body: JSON.stringify(data) }),
    cloneBudget: (id: string, targetMonth: number, targetYear: number) =>
        request(`${API_BASE}/budgets/${id}/clone`, {
            method: 'POST',
            body: JSON.stringify({ targetMonth, targetYear })
        }),
};
