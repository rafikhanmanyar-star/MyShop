/**
 * Parse QR / deep-link parameters from the app URL.
 * Supports: https://app.example.com/login?org=ORG001&branch=BR001
 * And HashRouter: #/login?org=ORG001&branch=BR001
 */
export interface QrParams {
  org_id: string;
  branch_id: string;
}

export function getQrParamsFromUrl(): QrParams | null {
  if (typeof window === 'undefined') return null;

  const href = window.location.href;
  let search = '';

  // HashRouter: query can be in hash, e.g. #/login?org=ORG001&branch=BR001
  if (window.location.hash && window.location.hash.includes('?')) {
    const hashPart = window.location.hash;
    const qIndex = hashPart.indexOf('?');
    search = hashPart.slice(qIndex);
  } else {
    search = window.location.search;
  }

  if (!search) return null;

  const params = new URLSearchParams(search);
  const org_id = params.get('org') || params.get('org_id') || '';
  const branch_id = params.get('branch') || params.get('branch_id') || '';

  if (org_id.trim() && branch_id.trim()) {
    return { org_id: org_id.trim(), branch_id: branch_id.trim() };
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
