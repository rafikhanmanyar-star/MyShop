import { Response, NextFunction } from 'express';
import { TenantRequest } from './tenantMiddleware.js';

export function checkRole(roles: string[]) {
    return (req: TenantRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: `Role '${req.user.role}' does not have permission to access this resource.`
            });
        }

        next();
    };
}
