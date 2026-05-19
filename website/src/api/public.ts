function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (import.meta.env.DEV) return '/api';
  if (env) return env.endsWith('/api') ? env : `${env.replace(/\/$/, '')}/api`;
  return '/api';
}

export function getUploadsBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env) return env.replace(/\/?api\/?$/i, '').replace(/\/$/, '');
  if (import.meta.env.DEV) return '';
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function imageUrl(path: string | null | undefined): string | undefined {
  if (!path?.trim()) return undefined;
  const raw = path.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = getUploadsBaseUrl();
  const clean = raw.startsWith('/') ? raw : `/${raw}`;
  return base ? `${base}${clean}` : clean;
}

const API = `${getApiBaseUrl()}/mobile`;

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export interface ShopInfo {
  company_name?: string;
  logo_url?: string | null;
  brand_color?: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  image_url?: string | null;
  imageUrl?: string | null;
  sale_price?: number | string | null;
  price?: number | string | null;
  on_sale?: boolean;
}

export interface ProductsResponse {
  items?: CatalogProduct[];
}

export function fetchShopInfo(slug: string) {
  return get<ShopInfo>(`${API}/${encodeURIComponent(slug)}/info`);
}

export function fetchProducts(slug: string, params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  return get<ProductsResponse>(`${API}/${encodeURIComponent(slug)}/products?${q}`);
}

export function fetchDiscover() {
  return get<{ shops: { slug: string; company_name: string; logo_url?: string | null; brand_color?: string }[] }>(
    `${API}/discover`
  );
}

export function productImage(product: CatalogProduct): string | undefined {
  const path = product.image_url ?? product.imageUrl;
  return imageUrl(path);
}

export function formatPrice(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(num)) return 'Rs. —';
  return `Rs. ${num.toLocaleString('en-PK')}`;
}

export function listedPrice(product: CatalogProduct): number | null {
  const raw = product.sale_price ?? product.price;
  const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}
