function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    const isDevServer = import.meta.env.DEV && protocol !== 'file:';
    if (isDevServer) return '/api';
    if (env) return env.endsWith('/api') ? env : `${env.replace(/\/?$/, '')}/api`;
    return `${protocol}//${hostname}${hostname === 'localhost' ? ':3000' : ''}/api`;
  }
  return env ? (env.endsWith('/api') ? env : `${env.replace(/\/?$/, '')}/api`) : 'http://localhost:3000/api';
}

const API_BASE = `${getApiBaseUrl()}/rider`;

/** Stage 11: EventSource URL (token in query; browsers cannot set Authorization on EventSource). */
export function getRiderStreamUrl(): string {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('rider_token') : null;
  const qs = new URLSearchParams();
  if (token) qs.set('access_token', token);
  return `${API_BASE}/stream?${qs.toString()}`;
}

function authHeaders(): HeadersInit {
  const t = localStorage.getItem('rider_token');
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

async function request(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers as Record<string, string>) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export type RiderProfile = {
  id: string;
  name: string;
  phone_number: string;
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  current_latitude: number | null;
  current_longitude: number | null;
};

export type RiderOrderBucket = 'assigned' | 'active' | 'completed';

export type RiderOrderRow = {
  delivery_order_id: string;
  delivery_status: string;
  order_id: string;
  order_number: string;
  order_status: string;
  grand_total: number;
  delivery_address: string;
  delivery_lat?: string | number | null;
  delivery_lng?: string | number | null;
  customer_name?: string;
  distance_km?: number | null;
  accepted_at?: string | null;
  created_at: string;
};

export type RiderOrdersResponse = {
  orders: RiderOrderRow[];
  hasMore: boolean;
};

export const riderApi = {
  login: (body: { phone: string; password: string; shopSlug: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request('/me') as Promise<RiderProfile>,
  postLocation: (body: { latitude: number; longitude: number }) =>
    request('/location', { method: 'POST', body: JSON.stringify(body) }),
  /** Online = AVAILABLE, Offline = OFFLINE */
  postStatus: (body: { status: 'AVAILABLE' | 'OFFLINE' }) =>
    request('/status', { method: 'POST', body: JSON.stringify(body) }),
  getOrders: (opts?: { bucket?: RiderOrderBucket; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.bucket) qs.set('bucket', opts.bucket);
    if (opts?.limit != null) qs.set('limit', String(opts.limit));
    if (opts?.offset != null) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return request(q ? `/orders?${q}` : '/orders') as Promise<RiderOrdersResponse>;
  },
  getOrder: (orderId: string) => request(`/orders/${encodeURIComponent(orderId)}`),
  accept: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/accept`, { method: 'POST', body: '{}' }),
  picked: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/picked`, { method: 'POST', body: '{}' }),
  onTheWay: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/on-the-way`, { method: 'POST', body: '{}' }),
  delivered: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/delivered`, { method: 'POST', body: '{}' }),
  reject: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/reject`, { method: 'POST', body: '{}' }),
};
