import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from './databaseService.js';

const JWT_EXPIRY = '12h';
const DEFAULT_USERNAME = 'Admin';
const DEFAULT_PASSWORD = 'Admin123';
const SEED_ID = 'platform_admin_seed';

export type PlatformAdminJwtPayload = {
  scope: 'platform_admin';
  platformAdminId: string;
  username: string;
};

export class PlatformAuthService {
  private db = getDatabaseService();

  /** Creates the default super admin if the table has no rows (first boot). */
  async ensureDefaultSuperAdmin(): Promise<void> {
    const rows = await this.db.query<{ n: string | number }>(
      `SELECT COUNT(*) AS n FROM platform_admins`
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) return;

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    await this.db.execute(
      `INSERT INTO platform_admins (id, username, password, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [SEED_ID, DEFAULT_USERNAME, hash]
    );
    console.log(
      `🔐 Seeded default platform super admin (username: ${DEFAULT_USERNAME}). Change the password after first login.`
    );
  }

  async login(username: string, password: string) {
    const u = (username || '').trim();
    const p = password || '';
    if (!u || !p) throw new Error('Username and password are required');

    const rows = await this.db.query<{ id: string; username: string; password: string }>(
      `SELECT id, username, password FROM platform_admins WHERE username = $1`,
      [u]
    );
    if (rows.length === 0) throw new Error('Invalid username or password');

    const row = rows[0];
    const ok = await bcrypt.compare(p, row.password);
    if (!ok) throw new Error('Invalid username or password');

    const token = this.signToken(row.id, row.username);
    return {
      token,
      platformAdminId: row.id,
      username: row.username,
      role: 'platform_admin' as const,
    };
  }

  signToken(platformAdminId: string, username: string): string {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
    const payload: PlatformAdminJwtPayload = {
      scope: 'platform_admin',
      platformAdminId,
      username,
    };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
  }

  verifyToken(token: string): PlatformAdminJwtPayload {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as PlatformAdminJwtPayload & jwt.JwtPayload;
    if (decoded.scope !== 'platform_admin' || !decoded.platformAdminId) {
      throw new Error('Invalid platform admin token');
    }
    return {
      scope: 'platform_admin',
      platformAdminId: decoded.platformAdminId,
      username: decoded.username,
    };
  }

  async changePassword(platformAdminId: string, currentPassword: string, newPassword: string) {
    const cur = (currentPassword || '').trim();
    const neu = newPassword || '';
    if (!cur || !neu) throw new Error('Current password and new password are required');
    if (neu.length < 8) throw new Error('New password must be at least 8 characters');

    const rows = await this.db.query<{ id: string; password: string }>(
      `SELECT id, password FROM platform_admins WHERE id = $1`,
      [platformAdminId]
    );
    if (rows.length === 0) throw new Error('Account not found');

    const row = rows[0];
    const ok = await bcrypt.compare(cur, row.password);
    if (!ok) throw new Error('Current password is incorrect');

    const hash = await bcrypt.hash(neu, 10);
    await this.db.execute(
      `UPDATE platform_admins SET password = $1, updated_at = NOW() WHERE id = $2`,
      [hash, platformAdminId]
    );
  }
}

let instance: PlatformAuthService | null = null;
export function getPlatformAuthService(): PlatformAuthService {
  if (!instance) instance = new PlatformAuthService();
  return instance;
}
