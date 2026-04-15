import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IDatabaseService } from '../services/databaseService.js';
import { runWithTenantContext } from '../services/tenantContext.js';

/** Bearer header, or GET `access_token` (Stage 11 SSE / EventSource). */
function getRiderJwtToken(req: any): string | undefined {
    const fromHeader = req.headers.authorization?.replace(/^Bearer\s+/i, '')?.trim();
    if (fromHeader) return fromHeader;
    if (req.method === 'GET' && typeof req.query.access_token === 'string' && req.query.access_token.length > 0) {
        return req.query.access_token;
    }
    return undefined;
}

/**
 * JWT auth for rider mobile app (`type: 'rider'`).
 */
export function riderAuthMiddleware(db: IDatabaseService) {
    return async (req: any, res: Response, next: NextFunction) => {
        try {
            const token = getRiderJwtToken(req);
            if (!token) {
                return res.status(401).json({ error: 'Authentication required.', code: 'NO_TOKEN' });
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
                return res.status(401).json({ error: 'Invalid session.', code: 'INVALID_TOKEN' });
            }

            if (decoded.type !== 'rider') {
                return res.status(401).json({ error: 'Invalid token type', code: 'WRONG_TOKEN_TYPE' });
            }

            const riders = await db.query(
                `SELECT id, is_active FROM riders WHERE id = $1 AND tenant_id = $2`,
                [decoded.riderId, decoded.tenantId]
            );
            if (riders.length === 0) {
                return res.status(401).json({ error: 'Rider not found', code: 'RIDER_NOT_FOUND' });
            }
            if (!riders[0].is_active) {
                return res.status(403).json({ error: 'Account disabled.', code: 'RIDER_DISABLED' });
            }

            req.tenantId = decoded.tenantId;
            req.riderId = decoded.riderId;
            req.riderPhone = decoded.phone;

            return await runWithTenantContext({ tenantId: decoded.tenantId }, async () => {
                next();
            });
        } catch (error) {
            console.error('Rider auth middleware error:', error);
            res.status(401).json({ error: 'Authentication failed' });
        }
    };
}
