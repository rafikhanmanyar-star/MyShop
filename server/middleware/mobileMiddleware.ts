import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IDatabaseService } from '../services/databaseService.js';
import { runWithTenantContextThroughResponse } from '../services/tenantContext.js';
import { resolveTenantFromShopSlug, assertJwtMatchesResolvedTenant, TenantMismatchError } from '../services/tenantResolver.js';
import { MOBILE_SHOP_SLUG_HEADER } from './mobileTenantGuard.js';

/** Bearer header, or GET `access_token` (for EventSource, which cannot set headers). */
function getMobileJwtToken(req: any): string | undefined {
    const fromHeader = req.headers.authorization?.replace(/^Bearer\s+/i, '')?.trim();
    if (fromHeader) return fromHeader;
    if (req.method === 'GET' && typeof req.query.access_token === 'string' && req.query.access_token.length > 0) {
        return req.query.access_token;
    }
    return undefined;
}

/**
 * Resolves tenant (and branch when slug is branch URL) from :shopSlug URL param.
 * Tries branch slug first, then tenant slug. Sets req.tenantId, req.branchId, req.shop.
 */
export function publicTenantMiddleware(db: IDatabaseService) {
    return async (req: any, res: Response, next: NextFunction) => {
        try {
            const slug = req.params.shopSlug;
            if (!slug) {
                return res.status(400).json({ error: 'Shop identifier is required' });
            }

            const resolved = await resolveTenantFromShopSlug(db, slug);
            if (!resolved) {
                return res.status(404).json({ error: 'Shop not found' });
            }

            const tenantRow = await db.query(
                'SELECT id, name, company_name, logo_url, brand_color, slug, address, phone FROM tenants WHERE id = $1',
                [resolved.tenantId]
            );
            if (tenantRow.length === 0) {
                return res.status(404).json({ error: 'Shop not found' });
            }

            const tenant = tenantRow[0];
            req.tenantId = tenant.id;
            req.branchId = resolved.branchId || null;
            req.shop = { ...tenant, branchId: resolved.branchId };
            req.resolvedShopSlug = slug;

            return await runWithTenantContextThroughResponse(
                { tenantId: tenant.id },
                res,
                next
            );
        } catch (error) {
            console.error('Public tenant middleware error:', error);
            res.status(500).json({ error: 'Failed to resolve shop' });
        }
    };
}

/**
 * Authenticates mobile customers via JWT.
 * Extracts customerId and tenantId from the token.
 */
export function mobileAuthMiddleware(db: IDatabaseService) {
    return async (req: any, res: Response, next: NextFunction) => {
        try {
            const token = getMobileJwtToken(req);

            if (!token) {
                return res.status(401).json({ error: 'Authentication required. Please log in.' });
            }

            if (!process.env.JWT_SECRET) {
                return res.status(500).json({ error: 'Server configuration error' });
            }

            let decoded: any;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
            } catch (jwtError: any) {
                if (jwtError.name === 'TokenExpiredError') {
                    return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
                }
                return res.status(401).json({ error: 'Invalid session. Please log in again.', code: 'INVALID_TOKEN' });
            }

            if (decoded.type !== 'mobile_customer') {
                return res.status(401).json({ error: 'Invalid token type', code: 'WRONG_TOKEN_TYPE' });
            }

            // Verify customer exists and is not blocked
            const customers = await db.query(
                'SELECT id, is_blocked, is_verified FROM mobile_customers WHERE id = $1 AND tenant_id = $2',
                [decoded.customerId, decoded.tenantId]
            );

            if (customers.length === 0) {
                return res.status(401).json({ error: 'Account not found', code: 'CUSTOMER_NOT_FOUND' });
            }

            if (customers[0].is_blocked) {
                return res.status(403).json({ error: 'Your account has been blocked. Contact the shop.', code: 'CUSTOMER_BLOCKED' });
            }

            // When URL/header already resolved a shop, JWT tenant must match (never trust JWT alone on slug routes).
            const slugHint =
                (typeof req.params?.shopSlug === 'string' && req.params.shopSlug) ||
                (typeof req.headers[MOBILE_SHOP_SLUG_HEADER] === 'string' && req.headers[MOBILE_SHOP_SLUG_HEADER]) ||
                (typeof req.headers[MOBILE_SHOP_SLUG_HEADER.toLowerCase()] === 'string' &&
                    req.headers[MOBILE_SHOP_SLUG_HEADER.toLowerCase()]) ||
                undefined;

            if (req.tenantId && slugHint) {
                const resolved = await resolveTenantFromShopSlug(db, String(slugHint));
                if (resolved) {
                    assertJwtMatchesResolvedTenant(decoded.tenantId, resolved, {
                        shopSlug: String(slugHint),
                        customerId: decoded.customerId,
                        path: req.path,
                    });
                    req.tenantId = resolved.tenantId;
                    if (resolved.branchId && !req.branchId) req.branchId = resolved.branchId;
                }
            } else {
                req.tenantId = decoded.tenantId;
            }

            req.customerId = decoded.customerId;
            req.customerPhone = decoded.phone;

            return await runWithTenantContextThroughResponse(
                { tenantId: req.tenantId },
                res,
                next
            );
        } catch (error) {
            if (error instanceof TenantMismatchError) {
                return res.status(error.statusCode).json({ error: error.message, code: error.code });
            }
            console.error('Mobile auth middleware error:', error);
            res.status(401).json({ error: 'Authentication failed' });
        }
    };
}
