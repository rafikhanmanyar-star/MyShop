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

export const riderApi = {
  login: (body: { phone: string; password: string; shopSlug: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getOrders: () => request('/orders'),
  getOrder: (orderId: string) => request(`/orders/${encodeURIComponent(orderId)}`),
  accept: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/accept`, { method: 'POST', body: '{}' }),
  picked: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/picked`, { method: 'POST', body: '{}' }),
  delivered: (orderId: string) =>
    request(`/orders/${encodeURIComponent(orderId)}/delivered`, { method: 'POST', body: '{}' }),
};
