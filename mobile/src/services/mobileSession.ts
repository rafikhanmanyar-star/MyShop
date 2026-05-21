/**
 * Per-shop mobile customer session — prevents JWT from tenant A being used on shop slug B.
 */

const AUTH_KEY_PREFIX = 'mobile_token:';
const CUSTOMER_KEY_PREFIX = 'mobile_customer:';
const TENANT_KEY_PREFIX = 'mobile_tenant_id:';
const LEGACY_AUTH_KEY = 'mobile_token';
const LEGACY_CUSTOMER_KEY = 'mobile_customer';

export interface MobileSession {
  token: string;
  customerId: string;
  tenantId: string;
  phone: string;
  name: string | null;
}

function keysForSlug(shopSlug: string) {
  const slug = shopSlug.trim().toLowerCase();
  return {
    token: `${AUTH_KEY_PREFIX}${slug}`,
    customer: `${CUSTOMER_KEY_PREFIX}${slug}`,
    tenant: `${TENANT_KEY_PREFIX}${slug}`,
  };
}

export function getMobileSession(shopSlug: string | null | undefined): MobileSession | null {
  if (!shopSlug) return null;
  const k = keysForSlug(shopSlug);
  try {
    const token = localStorage.getItem(k.token);
    const customerRaw = localStorage.getItem(k.customer);
    const tenantId = localStorage.getItem(k.tenant);
    if (!token || !customerRaw || !tenantId) return null;
    const c = JSON.parse(customerRaw) as { id: string; phone?: string; name?: string | null };
    return {
      token,
      customerId: c.id,
      tenantId,
      phone: c.phone ?? '',
      name: c.name ?? null,
    };
  } catch {
    return null;
  }
}

export function saveMobileSession(shopSlug: string, session: MobileSession): void {
  const k = keysForSlug(shopSlug);
  localStorage.setItem(k.token, session.token);
  localStorage.setItem(k.tenant, session.tenantId);
  localStorage.setItem(
    k.customer,
    JSON.stringify({ id: session.customerId, phone: session.phone, name: session.name })
  );
  // Legacy keys for code paths not yet migrated — always mirror active shop only
  localStorage.setItem(LEGACY_AUTH_KEY, session.token);
  localStorage.setItem(LEGACY_CUSTOMER_KEY, JSON.stringify({ id: session.customerId, phone: session.phone, name: session.name }));
  localStorage.setItem('mobile_tenant_id', session.tenantId);
}

export function clearMobileSession(shopSlug: string | null | undefined): void {
  if (shopSlug) {
    const k = keysForSlug(shopSlug);
    localStorage.removeItem(k.token);
    localStorage.removeItem(k.customer);
    localStorage.removeItem(k.tenant);
  }
  localStorage.removeItem(LEGACY_AUTH_KEY);
  localStorage.removeItem(LEGACY_CUSTOMER_KEY);
  localStorage.removeItem('mobile_tenant_id');
}

/** JWT payload tenantId (no verify — display/bootstrap only). */
export function decodeJwtTenantId(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1])) as { tenantId?: string };
    return payload.tenantId ?? null;
  } catch {
    return null;
  }
}

export function getAuthTokenForShop(shopSlug: string | null | undefined): string | null {
  const session = getMobileSession(shopSlug);
  if (session?.token) return session.token;
  return localStorage.getItem(LEGACY_AUTH_KEY);
}

export const MOBILE_SHOP_SLUG_HEADER = 'x-shop-slug';
