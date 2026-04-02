import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from './databaseService.js';
import { getCoaSeedService } from './coaSeedService.js';

const JWT_EXPIRY = '30d';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export class AuthService {
  private db = getDatabaseService();

  async register(data: {
    name: string;
    email: string;
    username: string;
    password: string;
    companyName?: string;
  }) {
    const existing = await this.db.query('SELECT id FROM tenants WHERE email = $1', [data.email]);
    if (existing.length > 0) {
      throw new Error('An account with this email already exists');
    }

    const tenantId = generateId('tenant');
    const userId = generateId('user');
    const hashedPassword = await bcrypt.hash(data.password, 10);

    await this.db.execute(
      `INSERT INTO tenants (id, name, company_name, email) VALUES ($1, $2, $3, $4)`,
      [tenantId, data.name, data.companyName || data.name, data.email]
    );

    await this.db.execute(
      `INSERT INTO users (id, tenant_id, username, name, role, password, email, is_active)
       VALUES ($1, $2, $3, $4, 'admin', $5, $6, TRUE)`,
      [userId, tenantId, data.username, data.name, hashedPassword, data.email]
    );

    const token = this.generateToken(userId, tenantId, data.username, 'admin');
    await this.createSession(userId, tenantId, token);

    // Seed enterprise Chart of Accounts for new tenant
    try {
      await getCoaSeedService().seedDefaultChartOfAccounts(tenantId);
    } catch (err) {
      console.warn('CoA seed failed for new tenant (non-fatal):', err);
    }

    return { token, tenantId, userId, username: data.username, role: 'admin', name: data.name };
  }

  async login(data: { username: string; password: string; orgId?: string }) {
    const users = await this.db.query(
      `SELECT u.id, u.tenant_id, u.username, u.name, u.role, u.password, u.is_active
       FROM users u WHERE u.username = $1`,
      [data.username]
    );

    if (users.length === 0) {
      throw new Error('Invalid username or password');
    }

    // If org_id (QR) provided, only consider users in that tenant
    const candidates = data.orgId
      ? users.filter((u: any) => u.tenant_id === data.orgId)
      : users;

    let matchedUser = null;
    for (const user of candidates) {
      if (!user.is_active) continue;
      const valid = await bcrypt.compare(data.password, user.password);
      if (valid) {
        matchedUser = user;
        break;
      }
    }

    if (data.orgId && users.some((u: any) => u.tenant_id === data.orgId) && !matchedUser) {
      throw new Error('User does not belong to this organization or invalid password');
    }

    if (!matchedUser) {
      const hasInactive = users.some((u: any) => !u.is_active);
      if (hasInactive && users.every((u: any) => !u.is_active)) {
        throw new Error('Account is deactivated. Contact your administrator.');
      }
      throw new Error('Invalid username or password');
    }

    // Single session per user: replace any existing session so re-login works even if
    // logout failed (e.g. expired token, network error) or user closed the app without logging out
    await this.db.execute('DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2', [matchedUser.id, matchedUser.tenant_id]);

    const token = this.generateToken(matchedUser.id, matchedUser.tenant_id, matchedUser.username, matchedUser.role);
    await this.createSession(matchedUser.id, matchedUser.tenant_id, token);

    await this.db.execute('UPDATE users SET login_status = TRUE WHERE id = $1 AND tenant_id = $2', [matchedUser.id, matchedUser.tenant_id]);

    return {
      token,
      tenantId: matchedUser.tenant_id,
      userId: matchedUser.id,
      username: matchedUser.username,
      role: matchedUser.role,
      name: matchedUser.name,
    };
  }

  async logout(userId: string, tenantId: string) {
    await this.db.execute('DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
    await this.db.execute('UPDATE users SET login_status = FALSE WHERE id = $1 AND tenant_id = $2', [userId, tenantId]);
  }

  /**
   * Public metadata for login screen (no auth). Resolves tenant by id or slug.
   * Optional branchId must belong to the tenant or it is ignored.
   */
  async getPublicOrganizationInfo(identifier: string, branchId?: string | null) {
    const trimmed = (identifier || '').trim();
    if (!trimmed) return null;

    const tenants = await this.db.query(
      `SELECT id, name, company_name, slug FROM tenants WHERE id = $1 OR slug = $1 LIMIT 1`,
      [trimmed]
    );
    if (tenants.length === 0) return null;

    const row = tenants[0] as { id: string; name: string; company_name: string | null; slug: string | null };
    let branch_name: string | null = null;
    const bid = (branchId || '').trim();
    if (bid) {
      const branches = await this.db.query(
        `SELECT name FROM shop_branches WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [bid, row.id]
      );
      if (branches.length > 0) {
        branch_name = (branches[0] as { name: string }).name;
      }
    }

    return {
      id: row.id,
      name: row.name,
      company_name: row.company_name || '',
      slug: row.slug,
      branch_name,
    };
  }

  private generateToken(userId: string, tenantId: string, username: string, role: string): string {
    return jwt.sign(
      { userId, tenantId, username, role },
      process.env.JWT_SECRET!,
      { expiresIn: JWT_EXPIRY }
    );
  }

  private async createSession(userId: string, tenantId: string, token: string) {
    const sessionId = generateId('session');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.db.execute(
      `INSERT INTO user_sessions (id, user_id, tenant_id, token, expires_at, last_activity)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, tenant_id)
       DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, last_activity = NOW()`,
      [sessionId, userId, tenantId, token, expiresAt]
    );
  }
}

let authServiceInstance: AuthService | null = null;
export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}
