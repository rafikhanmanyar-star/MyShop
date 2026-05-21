/** Keep in sync with client/src/config/apiUrl.ts so API + image URLs resolve the same way. */
const API_PORT = 3001;

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

        // Production without env: assume API on same host (or localhost:3001 in dev-like setups)
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

export function getFullImageUrl(path: string | null | undefined): string | undefined {
    if (path == null || path === '') return undefined;
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
    getProductRecommendations: (slug: string, id: string) =>
        request(`${API_BASE}/${slug}/products/${encodeURIComponent(id)}/recommendations`),
    getOffers: (slug: string) => request(`${API_BASE}/${slug}/offers`),
    getOffer: (slug: string, offerId: string) => request(`${API_BASE}/${slug}/offers/${offerId}`),
    getRecipeCategories: (slug: string) => request(`${API_BASE}/${slug}/recipe-categories`),
    getRecipes: (slug: string, params: Record<string, string | number | undefined> = {}) => {
        const q = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== '') q.set(k, String(v));
        });
        const qs = q.toString();
        return request(`${API_BASE}/${slug}/recipes${qs ? `?${qs}` : ''}`);
    },
    getRecipe: (slug: string, id: string) => request(`${API_BASE}/${slug}/recipes/${encodeURIComponent(id)}`),
    generateRecipeCart: (slug: string, id: string, body?: { servings?: number }) =>
        request(`${API_BASE}/${slug}/recipes/${encodeURIComponent(id)}/generate-cart`, {
            method: 'POST',
            body: JSON.stringify(body || {}),
        }),
    getBrands: (slug: string) => request(`${API_BASE}/${slug}/brands`),
    getSearchSuggestions: (slug: string, params: { q: string; recent?: string[] }) => {
        const q = new URLSearchParams();
        q.set('q', params.q);
        if (params.recent?.length) q.set('recent', JSON.stringify(params.recent));
        return request(`${API_BASE}/${slug}/search/suggestions?${q.toString()}`);
    },
    getSearchTrending: (slug: string) => request(`${API_BASE}/${slug}/search/trending`),
    postSearchAnalytics: (slug: string, body: Record<string, unknown>) =>
        request(`${API_BASE}/${slug}/search/analytics`, { method: 'POST', body: JSON.stringify(body) }),
    getSearchRecommendations: (slug: string, params?: { q?: string; limit?: number }) => {
        const q = new URLSearchParams();
        if (params?.q) q.set('q', params.q);
        if (params?.limit != null) q.set('limit', String(params.limit));
        const qs = q.toString();
        return request(`${API_BASE}/${slug}/search/recommendations${qs ? `?${qs}` : ''}`);
    },
    getBranding: (slug: string) => request(`${API_BASE}/${slug}/branding`),
    getSignupOtpConfig: (slug: string) =>
        request(`${API_BASE}/${encodeURIComponent(slug)}/signup-otp-config`),
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
    registerRequestOtp: (phone: string, password: string, name: string, addressLine1: string, shopSlug: string) =>
        request(`${API_BASE}/auth/register-request`, {
            method: 'POST',
            body: JSON.stringify({ phone, password, name, addressLine1, shopSlug }),
        }),
    registerVerifyOtp: (phone: string, shopSlug: string, otp: string) =>
        request(`${API_BASE}/auth/register-verify`, {
            method: 'POST',
            body: JSON.stringify({ phone, shopSlug, otp }),
        }),
    login: (phone: string, password: string, shopSlug: string) =>
        request(`${API_BASE}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ phone, password, shopSlug }),
        }),
    forgotPassword: (phone: string, shopSlug: string) =>
        request(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            body: JSON.stringify({ phone, shopSlug }),
        }),
    changePassword: (oldPassword: string, newPassword: string) =>
        request(`${API_BASE}/auth/change-password`, {
            method: 'PUT',
            body: JSON.stringify({ oldPassword, newPassword }),
        }),
};

// ─── Customer (authenticated) ────────────────────────
export const customerApi = {
    getBranches: () => request(`${API_BASE}/branches`),
    getProfile: () => request(`${API_BASE}/profile`),
    updateProfile: (data: any) =>
        request(`${API_BASE}/profile`, { method: 'PUT', body: JSON.stringify(data) }),
    getDeliveryAddressSuggestions: (limit?: number) => {
        const qs = limit != null && Number.isFinite(limit) ? `?limit=${limit}` : '';
        return request(`${API_BASE}/delivery-address-suggestions${qs}`);
    },
    placeOrder: (data: any) =>
        request(`${API_BASE}/orders`, { method: 'POST', body: JSON.stringify(data) }),
    /** Same branch/stock/schedule rules as placeOrder; does not reserve inventory. Always HTTP 200 — check `ok`. */
    checkoutPreflight: async (data: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
        const token = localStorage.getItem('mobile_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const res = await fetch(`${API_BASE}/orders/checkout-preflight`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error((body as { error?: string }).error || `Preflight failed (${res.status})`);
        }
        return body as { ok: boolean; error?: string };
    },
    getOrders: (cursor?: string) =>
        request(`${API_BASE}/orders${cursor ? `?cursor=${cursor}` : ''}`),
    getOrder: (id: string) => request(`${API_BASE}/orders/${id}`),
    /** Driving ETA (Google Directions on server; cached). */
    getDeliveryEta: (id: string) =>
        request(`${API_BASE}/orders/${encodeURIComponent(id)}/delivery-eta`),
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
    getBudgetSuggestions: (month?: number, year?: number) => {
        const params = new URLSearchParams();
        if (month) params.append('month', month.toString());
        if (year) params.append('year', year.toString());
        const qs = params.toString();
        return request(`${API_BASE}/budget-suggestions${qs ? `?${qs}` : ''}`);
    },
    getBudgetAlerts: () => request(`${API_BASE}/budget-alerts`),
    /** Loyalty balance (backend-calculated; same source as POS) */
    getLoyaltyPoints: () => request(`${API_BASE}/loyalty-points`),
    getLoyaltyHistory: (limit?: number) => {
        const qs = limit != null ? `?limit=${limit}` : '';
        return request(`${API_BASE}/loyalty-history${qs}`);
    },
    getSavedRecipes: (shopSlug: string, params?: { limit?: number; offset?: number }) => {
        const q = new URLSearchParams();
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.offset != null) q.set('offset', String(params.offset));
        const qs = q.toString();
        return request(`${API_BASE}/${shopSlug}/recipes/saved${qs ? `?${qs}` : ''}`);
    },
    saveRecipe: (shopSlug: string, recipeId: string) =>
        request(`${API_BASE}/${shopSlug}/recipes/${encodeURIComponent(recipeId)}/save`, { method: 'POST', body: '{}' }),
    unsaveRecipe: (shopSlug: string, recipeId: string) =>
        request(`${API_BASE}/${shopSlug}/recipes/${encodeURIComponent(recipeId)}/save`, { method: 'DELETE' }),
};

function shopAuthRequest(shopSlug: string, path: string, options: RequestInit = {}) {
    return request(`${API_BASE}/${shopSlug}${path}`, options);
}

/** Authenticated routes under `/api/mobile/:shopSlug/...` */
export const menuPlannerApi = {
    createMenu: (shopSlug: string, body: { title: string; week_start_date: string }) =>
        shopAuthRequest(shopSlug, '/weekly-menus', { method: 'POST', body: JSON.stringify(body) }),
    listMenus: (shopSlug: string, params?: { week_start_date?: string; limit?: number; offset?: number }) => {
        const q = new URLSearchParams();
        if (params?.week_start_date) q.set('week_start_date', params.week_start_date);
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.offset != null) q.set('offset', String(params.offset));
        const qs = q.toString();
        return shopAuthRequest(shopSlug, `/weekly-menus${qs ? `?${qs}` : ''}`);
    },
    getMenu: (shopSlug: string, menuId: string) => shopAuthRequest(shopSlug, `/weekly-menus/${encodeURIComponent(menuId)}`),
    updateMenu: (shopSlug: string, menuId: string, body: Record<string, unknown>) =>
        shopAuthRequest(shopSlug, `/weekly-menus/${encodeURIComponent(menuId)}`, {
            method: 'PUT',
            body: JSON.stringify(body),
        }),
    deleteMenu: (shopSlug: string, menuId: string) =>
        shopAuthRequest(shopSlug, `/weekly-menus/${encodeURIComponent(menuId)}`, { method: 'DELETE' }),
    duplicateMenu: (shopSlug: string, menuId: string, week_start_date: string) =>
        shopAuthRequest(shopSlug, `/weekly-menus/${encodeURIComponent(menuId)}/duplicate`, {
            method: 'POST',
            body: JSON.stringify({ week_start_date }),
        }),
    addMenuItem: (shopSlug: string, menuId: string, body: Record<string, unknown>) =>
        shopAuthRequest(shopSlug, `/weekly-menus/${encodeURIComponent(menuId)}/items`, {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    updateMenuItem: (shopSlug: string, itemId: string, body: Record<string, unknown>) =>
        shopAuthRequest(shopSlug, `/menu-items/${encodeURIComponent(itemId)}`, {
            method: 'PUT',
            body: JSON.stringify(body),
        }),
    deleteMenuItem: (shopSlug: string, itemId: string) =>
        shopAuthRequest(shopSlug, `/menu-items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
    moveMenuItem: (shopSlug: string, itemId: string, body: Record<string, unknown>) =>
        shopAuthRequest(shopSlug, `/menu-items/${encodeURIComponent(itemId)}/move`, {
            method: 'PATCH',
            body: JSON.stringify(body),
        }),
    generateShoppingList: (shopSlug: string, menuId: string) =>
        shopAuthRequest(shopSlug, `/weekly-menus/${encodeURIComponent(menuId)}/generate-shopping-list`, {
            method: 'POST',
            body: '{}',
        }),
    getShoppingList: (shopSlug: string, listId: string) =>
        shopAuthRequest(shopSlug, `/shopping-lists/${encodeURIComponent(listId)}`),
    getExternalMarketList: (shopSlug: string, listId: string, acceptPlainText?: boolean) => {
        const token = localStorage.getItem('mobile_token');
        const url = `${getApiBaseUrl()}/mobile/${shopSlug}/shopping-lists/${encodeURIComponent(listId)}/external-market-list`;
        return fetch(url, {
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(acceptPlainText ? { Accept: 'text/plain' } : { Accept: 'application/json' }),
            },
        }).then(async (res) => {
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as any).error || `Request failed (${res.status})`);
            }
            return acceptPlainText ? res.text() : res.json();
        });
    },
    patchShoppingItem: (
        shopSlug: string,
        listId: string,
        itemId: string,
        body: { is_checked?: boolean; is_at_home?: boolean; matched_product_id?: string | null }
    ) =>
        shopAuthRequest(
            shopSlug,
            `/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
            { method: 'PATCH', body: JSON.stringify(body) }
        ),
    addShoppingToCart: (shopSlug: string, listId: string, body: { all?: boolean; item_ids?: string[] }) =>
        shopAuthRequest(shopSlug, `/shopping-lists/${encodeURIComponent(listId)}/add-to-cart`, {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    listMenuTemplates: (shopSlug: string) => shopAuthRequest(shopSlug, '/menu-templates'),
    createTemplateFromMenu: (shopSlug: string, menuId: string, name: string, visibility: 'private' | 'public') =>
        shopAuthRequest(shopSlug, `/menu-templates/from-menu/${encodeURIComponent(menuId)}`, {
            method: 'POST',
            body: JSON.stringify({ name, visibility }),
        }),
    applyTemplate: (shopSlug: string, menuId: string, templateId: string) =>
        shopAuthRequest(
            shopSlug,
            `/weekly-menus/${encodeURIComponent(menuId)}/apply-template/${encodeURIComponent(templateId)}`,
            { method: 'POST', body: '{}' }
        ),
    listCustomerMenuItems: (shopSlug: string) => shopAuthRequest(shopSlug, '/customer-menu-items'),
    createCustomerMenuItem: (shopSlug: string, body: Record<string, unknown>) =>
        shopAuthRequest(shopSlug, '/customer-menu-items', { method: 'POST', body: JSON.stringify(body) }),
    deleteCustomerMenuItem: (shopSlug: string, itemId: string) =>
        shopAuthRequest(shopSlug, `/customer-menu-items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
};

const VOICE_BASE = `${getApiBaseUrl()}/mobile/voice-orders`;

export const voiceOrderApi = {
    getSettings: () => request(`${VOICE_BASE}/settings`),
    create: (data: Record<string, unknown>) =>
        request(`${VOICE_BASE}/create`, { method: 'POST', body: JSON.stringify(data) }),
    list: (cursor?: string) =>
        request(`${VOICE_BASE}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
    get: (id: string) => request(`${VOICE_BASE}/${encodeURIComponent(id)}`),
    approve: (id: string) =>
        request(`${VOICE_BASE}/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' }),
    cancel: (id: string, note?: string) =>
        request(`${VOICE_BASE}/${encodeURIComponent(id)}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: 'Cancelled', note }),
        }),
    uploadAudio: async (
        orderId: string,
        file: File,
        durationSeconds: number,
        onProgress?: (pct: number) => void
    ) => {
        const token = localStorage.getItem('mobile_token');
        const form = new FormData();
        form.append('audio', file);
        form.append('durationSeconds', String(durationSeconds));
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${VOICE_BASE}/${encodeURIComponent(orderId)}/upload-audio`);
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
            };
            xhr.onload = () => {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300) resolve(data);
                    else reject(new Error(data.error || 'Upload failed'));
                } catch {
                    reject(new Error('Upload failed'));
                }
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send(form);
        });
    },
};
