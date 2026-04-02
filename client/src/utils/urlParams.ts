/**
 * Parse QR / deep-link parameters from the app URL.
 * Supports: https://app.example.com/login?org=ORG001&branch=BR001
 * And HashRouter: #/login?org=ORG001&branch=BR001
 */
export interface QrParams {
  org_id: string;
  branch_id: string;
}

function getSearchFromLocation(): string {
  if (typeof window === 'undefined') return '';

  // HashRouter: query can be in hash, e.g. #/login?org=ORG001&branch=BR001
  if (window.location.hash && window.location.hash.includes('?')) {
    const hashPart = window.location.hash;
    const qIndex = hashPart.indexOf('?');
    return hashPart.slice(qIndex);
  }
  return window.location.search;
}

/** Organization and optional branch from URL (org alone is enough to show which tenant you're signing into). */
export function getLoginOrgParamsFromUrl(): { org_id: string | null; branch_id: string | null } {
  if (typeof window === 'undefined') return { org_id: null, branch_id: null };

  const search = getSearchFromLocation();
  if (!search) return { org_id: null, branch_id: null };

  const params = new URLSearchParams(search);
  const org_id = (params.get('org') || params.get('org_id') || '').trim() || null;
  const branch_id = (params.get('branch') || params.get('branch_id') || '').trim() || null;

  return { org_id, branch_id };
}

export function getQrParamsFromUrl(): QrParams | null {
  const { org_id, branch_id } = getLoginOrgParamsFromUrl();
  if (org_id && branch_id) {
    return { org_id, branch_id };
  }
  return null;
}

/** Build login URL with org and branch for QR / sharing */
export function buildLoginUrl(baseUrl: string, orgId: string, branchId: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set('org', orgId);
  u.searchParams.set('branch', branchId);
  return u.toString();
}
