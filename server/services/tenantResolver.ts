import type { IDatabaseService } from './databaseService.js';
import { normalizeShopSlugForLookup } from '../utils/shopSlug.js';

/** How the active tenant was resolved — used in logs and security audits. */
export type TenantResolutionSource =
  | 'tenant_slug'
  | 'branch_slug'
  | 'tenant_branch_composite'
  | 'jwt'
  | 'subdomain'
  | 'custom_domain';

export interface ResolvedTenantContext {
  tenantId: string;
  /** Canonical tenant slug when known */
  slug: string | null;
  branchId: string | null;
  source: TenantResolutionSource;
  companyName?: string | null;
}

export class TenantMismatchError extends Error {
  readonly code = 'TENANT_MISMATCH';
  readonly statusCode = 403;
  constructor(
    message: string,
    public readonly details: {
      jwtTenantId?: string;
      resolvedTenantId?: string;
      shopSlug?: string;
    } = {}
  ) {
    super(message);
    this.name = 'TenantMismatchError';
  }
}

/** Structured security log for cross-tenant access attempts. */
export function logTenantSecurityAlert(
  event: string,
  meta: Record<string, unknown>
): void {
  console.warn(
    `[SECURITY][tenant] ${event}`,
    JSON.stringify({
      ...meta,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Resolve tenant from shop slug (mobile PWA / rider shop code).
 *
 * Resolution order (critical for isolation):
 * 1. Exact tenant slug — prevents another tenant's branch slug from shadowing a tenant slug.
 * 2. Composite `{tenantSlug}-{branchCode}` when tenant slug contains dashes.
 * 3. Branch-only slug — only when no tenant shares that slug (branch slugs are globally unique).
 */
export async function resolveTenantFromShopSlug(
  db: IDatabaseService,
  rawSlug: string
): Promise<ResolvedTenantContext | null> {
  const key = normalizeShopSlugForLookup(rawSlug);
  if (!key) return null;

  // ── 1. Tenant slug (highest priority) ─────────────────────────────
  const tenantRows = await db.query(
    `SELECT id, name, company_name, slug
     FROM tenants
     WHERE slug IS NOT NULL
       AND LOWER(TRIM(CAST(slug AS TEXT))) = $1`,
    [key]
  );

  if (tenantRows.length > 0) {
    const tenant = tenantRows[0] as {
      id: string;
      slug: string;
      company_name?: string;
      name?: string;
    };
    let branchId: string | null = null;
    let firstBranch = await db.query(
      `SELECT id FROM shop_branches
       WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
         AND latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY name ASC LIMIT 1`,
      [tenant.id]
    );
    if (firstBranch.length === 0) {
      firstBranch = await db.query(
        `SELECT id FROM shop_branches
         WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
         ORDER BY name ASC LIMIT 1`,
        [tenant.id]
      );
    }
    if (firstBranch.length > 0) branchId = firstBranch[0].id;

    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      branchId,
      source: 'tenant_slug',
      companyName: tenant.company_name ?? tenant.name ?? null,
    };
  }

  // ── 2. Composite tenantSlug-branchCode ────────────────────────────
  for (let i = key.length - 1; i > 0; i--) {
    if (key[i] !== '-') continue;
    const possibleTenantSlug = key.substring(0, i);
    const branchSuffix = key.substring(i + 1);
    if (!possibleTenantSlug || !branchSuffix) continue;

    const compositeTenantRows = await db.query(
      `SELECT id, slug, company_name, name
       FROM tenants
       WHERE slug IS NOT NULL
         AND LOWER(TRIM(CAST(slug AS TEXT))) = $1`,
      [possibleTenantSlug]
    );
    if (compositeTenantRows.length === 0) continue;

    const tenant = compositeTenantRows[0] as { id: string; slug: string; company_name?: string; name?: string };
    const branchRows = await db.query(
      `SELECT id FROM shop_branches
       WHERE tenant_id = $1
         AND COALESCE(is_active, TRUE) = TRUE
         AND LOWER(REGEXP_REPLACE(code, '[^a-zA-Z0-9]+', '-', 'g')) = $2`,
      [tenant.id, branchSuffix]
    );
    if (branchRows.length > 0) {
      return {
        tenantId: tenant.id,
        slug: tenant.slug,
        branchId: branchRows[0].id,
        source: 'tenant_branch_composite',
        companyName: tenant.company_name ?? tenant.name ?? null,
      };
    }
  }

  // ── 3. Branch slug only (globally unique index) ───────────────────
  const branchRows = await db.query(
    `SELECT id, tenant_id, slug, name
     FROM shop_branches
     WHERE slug IS NOT NULL
       AND LOWER(TRIM(CAST(slug AS TEXT))) = $1
       AND COALESCE(is_active, TRUE) = TRUE`,
    [key]
  );
  if (branchRows.length > 0) {
    const branch = branchRows[0] as { id: string; tenant_id: string; slug: string | null };
    const tenantMeta = await db.query(
      `SELECT slug, company_name, name FROM tenants WHERE id = $1`,
      [branch.tenant_id]
    );
    const t = tenantMeta[0] as { slug?: string; company_name?: string; name?: string } | undefined;
    return {
      tenantId: branch.tenant_id,
      slug: t?.slug ?? branch.slug,
      branchId: branch.id,
      source: 'branch_slug',
      companyName: t?.company_name ?? t?.name ?? null,
    };
  }

  return null;
}

/**
 * Ensures JWT tenant matches URL-resolved tenant (mobile customer routes).
 * Never trust client body `tenantId` — only slug + JWT.
 */
export function assertJwtMatchesResolvedTenant(
  jwtTenantId: string | undefined,
  resolved: ResolvedTenantContext,
  context: { shopSlug?: string; userId?: string; customerId?: string; path?: string }
): void {
  if (!jwtTenantId) {
    throw new TenantMismatchError('Authentication token missing tenant context.', {
      resolvedTenantId: resolved.tenantId,
      shopSlug: context.shopSlug,
    });
  }
  if (jwtTenantId !== resolved.tenantId) {
    logTenantSecurityAlert('jwt_tenant_slug_mismatch', {
      jwtTenantId,
      resolvedTenantId: resolved.tenantId,
      shopSlug: context.shopSlug,
      customerId: context.customerId,
      path: context.path,
    });
    throw new TenantMismatchError(
      'Your session belongs to a different shop. Please sign in again for this store.',
      { jwtTenantId, resolvedTenantId: resolved.tenantId, shopSlug: context.shopSlug }
    );
  }
}
