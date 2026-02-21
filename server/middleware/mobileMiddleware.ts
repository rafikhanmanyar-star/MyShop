import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IDatabaseService } from '../services/databaseService.js';
import { runWithTenantContext } from '../services/tenantContext.js';

/**
 * Resolves tenant from :shopSlug URL param. No authentication required.
 * Used for public product browsing endpoints.
 */
export function publicTenantMiddleware(db: IDatabaseService) {
    return async (req: any, res: Response, next: NextFunction) => {
        try {
            const slug = req.params.shopSlug;
            if (!slug) {
                return res.status(400).json({ error: 'Shop identifier is required' });
            }

            const rows = await db.query(
                'SELECT id, name, company_name, logo_url, brand_color, slug FROM tenants WHERE slug = $1',
                [slug]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Shop not found' });
            }

            const tenant = rows[0];
            req.tenantId = tenant.id;
            req.shop = tenant;

            return await runWithTenantContext(
                { tenantId: tenant.id },
                async () => { next(); }
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
            const token = req.headers.authorization?.replace('Bearer ', '');

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

            req.tenantId = decoded.tenantId;
            req.customerId = decoded.customerId;
            req.customerPhone = decoded.phone;

            return await runWithTenantContext(
                { tenantId: decoded.tenantId },
                async () => { next(); }
            );
        } catch (error) {
            console.error('Mobile auth middleware error:', error);
            res.status(401).json({ error: 'Authentication failed' });
        }
    };
}
