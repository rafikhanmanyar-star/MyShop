import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IDatabaseService } from '../services/databaseService.js';
import { runWithTenantContextThroughResponse } from '../services/tenantContext.js';

export interface TenantRequest extends Record<string, any> {
  tenantId?: string;
  userId?: string;
  userRole?: string;
  branchId?: string | null;
  user?: {
    userId: string;
    username: string;
    role: string;
  };
}

export function tenantMiddleware(db: IDatabaseService) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ error: 'No authentication token' });
      }

      if (!process.env.JWT_SECRET) {
        console.error('❌ JWT_SECRET is not configured');
        return res.status(500).json({ error: 'Server configuration error', code: 'JWT_SECRET_MISSING' });
      }

      let decoded: any;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      } catch (jwtError: any) {
        if (jwtError.name === 'TokenExpiredError') {
          return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
      }

      req.tenantId = decoded.tenantId;
      req.userId = decoded.userId;
      req.userRole = decoded.role;
      req.user = { userId: decoded.userId, username: decoded.username, role: decoded.role };

      if (!req.tenantId) {
        return res.status(401).json({ error: 'Invalid token', code: 'NO_TENANT_CONTEXT' });
      }

      // Verify user exists and belongs to the tenant
      try {
        const result = await db.query(
          `SELECT u.id AS user_id, u.tenant_id AS user_tenant_id, u.is_active,
                  s.user_id AS session_user_id, s.expires_at
           FROM users u
           LEFT JOIN user_sessions s ON s.token = $2 AND s.tenant_id = $3
           WHERE u.id = $1 AND u.tenant_id = $3`,
          [decoded.userId, token, decoded.tenantId]
        );

        if (result.length === 0) {
          return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        }

        const row = result[0];

        if (row.user_tenant_id !== decoded.tenantId) {
          return res.status(403).json({ error: 'Tenant mismatch', code: 'TENANT_MISMATCH' });
        }

        if (!row.is_active) {
          return res.status(401).json({ error: 'Account deactivated', code: 'USER_INACTIVE' });
        }

        // Session validation
        if (row.session_user_id) {
          const expiresAt = new Date(row.expires_at);
          if (expiresAt <= new Date()) {
            db.execute('DELETE FROM user_sessions WHERE token = $1 AND tenant_id = $2', [token, decoded.tenantId]).catch(() => { });
            return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
          }
          db.execute('UPDATE user_sessions SET last_activity = NOW() WHERE token = $1 AND tenant_id = $2', [token, decoded.tenantId]).catch(() => { });
        } else if (row.is_active) {
          // Recover missing session
          const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          await db.execute(
            `INSERT INTO user_sessions (id, user_id, tenant_id, token, expires_at, last_activity)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (user_id, tenant_id) DO UPDATE 
             SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, last_activity = NOW()`,
            [sessionId, decoded.userId, decoded.tenantId, token, expiresAt]
          );
        }
      } catch (authError) {
        console.error('Authentication check error:', authError);
        return res.status(500).json({ error: 'Authentication failed', code: 'SESSION_CHECK_FAILED' });
      }

      // Validate x-branch-id when present: must belong to tenant (never trust client-only branch)
      const branchIdHeader = (req.headers['x-branch-id'] as string)?.trim();
      if (branchIdHeader) {
        try {
          const branchRows = await db.query(
            'SELECT id FROM shop_branches WHERE id = $1 AND tenant_id = $2',
            [branchIdHeader, req.tenantId]
          );
          if (branchRows.length === 0) {
            return res.status(403).json({ error: 'Branch not found or access denied', code: 'INVALID_BRANCH' });
          }
          req.branchId = branchIdHeader;
        } catch (err) {
          console.error('Branch validation error:', err);
          return res.status(403).json({ error: 'Branch validation failed', code: 'INVALID_BRANCH' });
        }
      } else {
        req.branchId = null;
      }

      return await runWithTenantContextThroughResponse(
        { tenantId: req.tenantId!, userId: req.userId },
        res,
        next
      );
    } catch (error) {
      console.error('Tenant middleware error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
