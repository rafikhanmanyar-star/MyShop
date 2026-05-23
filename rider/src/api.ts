function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    const isDevServer = import.meta.env.DEV && protocol !== 'file:';
    if (isDevServer) return '/api';
    if (env) return env.endsWith('/api') ? env : `${env.replace(/\/?$/, '')}/api`;
    return `${protocol}//${hostname}${hostname === 'localhost' ? ':3001' : ''}/api`;
  }
  return env ? (env.endsWith('/api') ? env : `${env.replace(/\/?$/, '')}/api`) : 'http://localhost:3001/api';
}

const API_BASE = `${getApiBaseUrl()}/rider`;

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
  estimated_delivery_at?: string | null;
  payment_method?: string | null;
  delivery_notes?: string | null;
  item_count?: number;
  cod_expected?: number | null;
  cod_collected?: number | null;
  arrived_at?: string | null;
};

export type RiderOrdersResponse = {
  orders: RiderOrderRow[];
  hasMore: boolean;
};

export type RiderSummary = {
  assigned_pending: number;
  pickup_pending: number;
  deliveries_pending: number;
  delivered_today: number;
  cod_collected_today: number;
  cod_pending: number;
  rider?: { name?: string; status?: string };
};

export type RiderCashSummary = {
  cod_pending: number;
  cod_collected_today: number;
  orders: Array<{
    order_id: string;
    order_number: string;
    status: string;
    expected: number;
    collected: number | null;
  }>;
};

export type DeliveryProofPayload = {
  proofType?: 'otp' | 'signature' | 'photo' | 'qr';
  proofData?: string;
  codCollected?: number;
};

export type FailedDeliveryPayload = {
  reason: string;
  notes?: string;
  proofData?: string;
};

export const riderApi = {
  login: (body: { phone: string; password: string; shopSlug: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request('/me') as Promise<RiderProfile>,
  getSummary: () => request('/summary') as Promise<RiderSummary>,
  getCashSummary: () => request('/cash-summary') as Promise<RiderCashSummary>,
  postLocation: (body: { latitude: number; longitude: number }) =>
    request('/location', { method: 'POST', body: JSON.stringify(body) }),
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
  arrived: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/arrived`, { method: 'POST', body: '{}' }),
  delivered: (orderId: string, body?: DeliveryProofPayload) =>
    request(`/orders/${encodeURIComponent(orderId)}/delivered`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  failed: (orderId: string, body: FailedDeliveryPayload) =>
    request(`/orders/${encodeURIComponent(orderId)}/failed`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reject: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/reject`, { method: 'POST', body: '{}' }),

  getAnalytics: (days = 7) =>
    request(`/analytics?days=${days}`) as Promise<RiderAnalytics>,

  getOptimizedRoute: () => request('/route/optimize') as Promise<OptimizedRoute>,

  getPushPublicKey: () => request('/push/vapid-public-key') as Promise<{ publicKey: string | null }>,

  subscribePush: (subscription: PushSubscriptionJSON) =>
    request('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),

  getChatThreads: () => request('/chat/threads') as Promise<{ threads: ChatThread[] }>,

  getChatMessages: (orderId: string) =>
    request(`/chat/${encodeURIComponent(orderId)}`) as Promise<{ messages: ChatMessage[] }>,

  sendChatMessage: (orderId: string, body: string) =>
    request(`/chat/${encodeURIComponent(orderId)}`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }) as Promise<ChatMessage>,
};

export type ChatMessage = {
  id: string;
  sender_role: 'rider' | 'shop' | 'customer';
  sender_id: string | null;
  body: string;
  created_at: string;
};

export type ChatThread = {
  order_id: string;
  order_number: string;
  customer_name: string;
  delivery_status: string;
  last_message?: string | null;
  last_message_at?: string | null;
};

export type RiderAnalytics = {
  period_days: number;
  delivered_today: number;
  total_deliveries: number;
  completed: number;
  failed: number;
  success_rate: number;
  cod_collected: number;
  avg_delivery_minutes: number | null;
  distance_km: number;
  customer_rating: number | null;
  daily: Array<{ day: string; deliveries: number; cod: number }>;
};

export type OptimizedRoute = {
  stops: Array<{
    order_id: string;
    order_number: string;
    sequence: number;
    customer_name: string;
    delivery_address: string;
    leg_km: number | null;
    leg_minutes: number | null;
  }>;
  total_km: number;
  total_minutes: number;
  origin?: { lat: number; lng: number };
};
