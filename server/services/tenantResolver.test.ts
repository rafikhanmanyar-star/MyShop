import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assertJwtMatchesResolvedTenant,
  resolveTenantFromShopSlug,
  TenantMismatchError,
} from './tenantResolver.js';
import type { IDatabaseService } from './databaseService.js';

function mockDb(handlers: {
  tenantBySlug?: Record<string, { id: string; slug: string; company_name?: string; name?: string }>;
  branchBySlug?: Record<string, { id: string; tenant_id: string; slug: string }>;
  branchesForTenant?: Record<string, { id: string }[]>;
}): IDatabaseService {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const p0 = params?.[0];
      if (sql.includes('FROM tenants') && sql.includes('LOWER(TRIM(CAST(slug')) {
        const row = handlers.tenantBySlug?.[String(p0)];
        return row ? [row] : [];
      }
      if (sql.includes('FROM shop_branches') && sql.includes('LOWER(TRIM(CAST(slug') && !sql.includes('REGEXP_REPLACE')) {
        const row = handlers.branchBySlug?.[String(p0)];
        return row ? [row] : [];
      }
      if (sql.includes('FROM shop_branches') && sql.includes('tenant_id = $1') && sql.includes('latitude')) {
        const list = handlers.branchesForTenant?.[String(p0)] ?? [];
        return list;
      }
      if (sql.includes('FROM shop_branches') && sql.includes('tenant_id = $1') && sql.includes('ORDER BY name')) {
        const list = handlers.branchesForTenant?.[String(p0)] ?? [];
        return list;
      }
      if (sql.includes('FROM tenants WHERE id = $1')) {
        for (const t of Object.values(handlers.tenantBySlug ?? {})) {
          if (t.id === p0) return [t];
        }
        return [];
      }
      return [];
    }),
    execute: vi.fn(),
    transaction: vi.fn(),
    healthCheck: vi.fn(),
    close: vi.fn(),
    getType: () => 'postgres' as const,
  };
}

describe('resolveTenantFromShopSlug', () => {
  it('prefers tenant slug over branch slug when both could match', async () => {
    const db = mockDb({
      tenantBySlug: {
        obostores: { id: 'tenant_obostores', slug: 'obostores', company_name: 'OBO Stores' },
      },
      branchBySlug: {
        obostores: { id: 'branch_tk', tenant_id: 'tenant_tk', slug: 'obostores' },
      },
      branchesForTenant: {
        tenant_obostores: [{ id: 'b1' }],
      },
    });

    const resolved = await resolveTenantFromShopSlug(db, 'obostores');
    expect(resolved).not.toBeNull();
    expect(resolved!.tenantId).toBe('tenant_obostores');
    expect(resolved!.source).toBe('tenant_slug');
  });

  it('falls back to branch slug when no tenant slug matches', async () => {
    const db = mockDb({
      tenantBySlug: {},
      branchBySlug: {
        'north-branch': { id: 'branch_1', tenant_id: 'tenant_tk', slug: 'north-branch' },
      },
      branchesForTenant: {},
    });

    const resolved = await resolveTenantFromShopSlug(db, 'north-branch');
    expect(resolved?.tenantId).toBe('tenant_tk');
    expect(resolved?.source).toBe('branch_slug');
  });
});

describe('assertJwtMatchesResolvedTenant', () => {
  it('throws when JWT tenant differs from resolved shop tenant', () => {
    expect(() =>
      assertJwtMatchesResolvedTenant('tenant_tk', {
        tenantId: 'tenant_obostores',
        slug: 'obostores',
        branchId: null,
        source: 'tenant_slug',
      }, { shopSlug: 'obostores' })
    ).toThrow(TenantMismatchError);
  });
});
