import type { NextFunction, Response } from 'express';
import type { IDatabaseService } from '../services/databaseService.js';
import {
  assertJwtMatchesResolvedTenant,
  resolveTenantFromShopSlug,
  TenantMismatchError,
} from '../services/tenantResolver.js';

/** Header sent by mobile PWA on slug-less authenticated routes (e.g. POST /orders). */
export const MOBILE_SHOP_SLUG_HEADER = 'x-shop-slug';

function shopSlugFromRequest(req: any): string | undefined {
  const fromParams = req.params?.shopSlug;
  if (typeof fromParams === 'string' && fromParams.trim()) return fromParams.trim();
  const fromHeader = req.headers[MOBILE_SHOP_SLUG_HEADER] ?? req.headers[MOBILE_SHOP_SLUG_HEADER.toLowerCase()];
  if (typeof fromHeader === 'string' && fromHeader.trim()) return fromHeader.trim();
  return undefined;
}

/**
 * After mobileAuthMiddleware: resolve shop slug and require JWT tenantId to match.
 * Prevents orders/sessions for tenant A while browsing shop slug for tenant B.
 */
export function mobileTenantGuard(db: IDatabaseService) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const slug = shopSlugFromRequest(req);
      if (!slug) {
        return res.status(400).json({
          error: 'Shop context required. Include shop slug in URL or X-Shop-Slug header.',
          code: 'SHOP_SLUG_REQUIRED',
        });
      }

      const resolved = await resolveTenantFromShopSlug(db, slug);
      if (!resolved) {
        return res.status(404).json({ error: 'Shop not found', code: 'SHOP_NOT_FOUND' });
      }

      assertJwtMatchesResolvedTenant(req.tenantId, resolved, {
        shopSlug: slug,
        customerId: req.customerId,
        path: req.path,
      });

      req.resolvedShopSlug = slug;
      req.resolvedTenantId = resolved.tenantId;
      if (resolved.branchId && !req.branchId) {
        req.branchId = resolved.branchId;
      }
      next();
    } catch (err) {
      if (err instanceof TenantMismatchError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      console.error('[mobileTenantGuard]', err);
      return res.status(500).json({ error: 'Tenant validation failed' });
    }
  };
}
