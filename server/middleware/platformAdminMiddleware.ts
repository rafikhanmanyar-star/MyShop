import { Request, Response, NextFunction } from 'express';
import { getPlatformAuthService } from '../services/platformAuthService.js';

export interface PlatformRequest extends Request {
  platformAdmin?: { id: string; username: string };
}

/**
 * Cross-tenant platform routes: accept either
 * - `Authorization: Bearer <token>` from POST /api/platform/auth/login, or
 * - `X-Platform-Admin-Secret` matching PLATFORM_ADMIN_SECRET (optional, for automation).
 */
export function platformAdminMiddleware(req: PlatformRequest, res: Response, next: NextFunction) {
  const raw = req.headers.authorization;
  const token =
    typeof raw === 'string' && raw.toLowerCase().startsWith('bearer ')
      ? raw.slice(7).trim()
      : '';

  if (token && process.env.JWT_SECRET) {
    try {
      const payload = getPlatformAuthService().verifyToken(token);
      req.platformAdmin = { id: payload.platformAdminId, username: payload.username };
      return next();
    } catch {
      // try shared secret below
    }
  }

  const secret = process.env.PLATFORM_ADMIN_SECRET?.trim();
  if (secret) {
    const header = (req.headers['x-platform-admin-secret'] as string | undefined)?.trim();
    if (header && header === secret) {
      return next();
    }
  }

  return res.status(401).json({
    error:
      'Platform admin authentication required. Log in at /api/platform/auth/login or send X-Platform-Admin-Secret.',
    code: 'PLATFORM_ADMIN_UNAUTHORIZED',
  });
}

/** Requires a valid platform super-admin JWT (e.g. change password). */
export function platformJwtMiddleware(req: PlatformRequest, res: Response, next: NextFunction) {
  const raw = req.headers.authorization;
  const token =
    typeof raw === 'string' && raw.toLowerCase().startsWith('bearer ')
      ? raw.slice(7).trim()
      : '';

  if (!token) {
    return res.status(401).json({ error: 'Bearer token required', code: 'PLATFORM_JWT_MISSING' });
  }

  try {
    const payload = getPlatformAuthService().verifyToken(token);
    req.platformAdmin = { id: payload.platformAdminId, username: payload.username };
    next();
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired platform admin token',
      code: 'PLATFORM_JWT_INVALID',
    });
  }
}
