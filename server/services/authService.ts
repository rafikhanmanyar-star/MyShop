import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from './databaseService.js';
import { getCoaSeedService } from './coaSeedService.js';

const JWT_EXPIRY = '30d';

/** Sessions without API activity longer than this do not occupy a POS terminal slot (abandoned clients). */
const POS_TERMINAL_IDLE_MS = 45 * 60 * 1000;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function isUniqueViolation(err: unknown): boolean {
  const anyErr = err as { code?: string; message?: string };
  if (anyErr?.code === '23505') return true;
  const msg = (anyErr?.message || '').toLowerCase();
  return msg.includes('unique constraint failed') || msg.includes('unique violation');
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
    await this.createSession(userId, tenantId, token, null);

    // Seed enterprise Chart of Accounts for new tenant
    try {
      await getCoaSeedService().seedDefaultChartOfAccounts(tenantId);
    } catch (err) {
      console.warn('CoA seed failed for new tenant (non-fatal):', err);
    }

    return { token, tenantId, userId, username: data.username, role: 'admin', name: data.name };
  }

  async login(data: { username: string; password: string; orgId?: string; posClient?: boolean }) {
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

    const posClient = Boolean(data.posClient);
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.completeLoginAfterPasswordOk(matchedUser, posClient);
      } catch (e) {
        lastErr = e;
        if (posClient && isUniqueViolation(e) && attempt < 3) continue;
        throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Login failed');
  }

  /**
   * Creates session after password verified. For desktop POS (`posClient`), reserves a free
   * `shop_terminals` row or rejects when all terminals are active or none exist.
   */
  private async completeLoginAfterPasswordOk(
    matchedUser: { id: string; tenant_id: string; username: string; name: string; role: string },
    posClient: boolean
  ) {
    return this.db.transaction(async (client) => {
      await client.execute('DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2', [
        matchedUser.id,
        matchedUser.tenant_id,
      ]);

      // Release terminal slots held by idle or expired sessions. assignNextAvailable ignores idle
      // holders for "busy" detection, but idx_user_sessions_pos_terminal_unique still blocks INSERT
      // until those rows clear pos_terminal_id (otherwise a "free" terminal re-assignment hits 23505).
      const nowIso = new Date().toISOString();
      const idleCutoffIso = new Date(Date.now() - POS_TERMINAL_IDLE_MS).toISOString();
      await client.execute(
        `UPDATE user_sessions SET pos_terminal_id = NULL
         WHERE tenant_id = $1 AND pos_terminal_id IS NOT NULL
           AND (expires_at <= $2 OR last_activity <= $3)`,
        [matchedUser.tenant_id, nowIso, idleCutoffIso]
      );

      let posTerminalId: string | null = null;
      if (posClient) {
        posTerminalId = await this.assignNextAvailablePosTerminal(client, matchedUser.tenant_id);
        if (!posTerminalId) {
          const rows = await client.query(
            `SELECT COUNT(*) AS c FROM shop_terminals WHERE tenant_id = $1`,
            [matchedUser.tenant_id]
          );
          const n = Number((rows[0] as { c?: number | string })?.c ?? 0);
          if (n === 0) {
            throw new Error(
              'No POS terminals are configured for this store. Add terminals under Multi-Store → Terminals before signing in on the desktop POS.'
            );
          }
          throw new Error(
            'All POS terminals are in use. Ask another cashier to sign out, wait for an inactive session to time out, or add a terminal in Multi-Store.'
          );
        }
      }

      const token = this.generateToken(matchedUser.id, matchedUser.tenant_id, matchedUser.username, matchedUser.role);
      await this.createSessionWithClient(client, matchedUser.id, matchedUser.tenant_id, token, posTerminalId);

      await client.execute('UPDATE users SET login_status = TRUE WHERE id = $1 AND tenant_id = $2', [
        matchedUser.id,
        matchedUser.tenant_id,
      ]);

      return {
        token,
        tenantId: matchedUser.tenant_id,
        userId: matchedUser.id,
        username: matchedUser.username,
        role: matchedUser.role,
        name: matchedUser.name,
        posTerminalId,
      };
    });
  }

  /**
   * Picks a terminal not held by another non-idle POS session (same tenant).
   */
  private async assignNextAvailablePosTerminal(
    client: { query: (sql: string, params?: any[]) => Promise<any[]> },
    tenantId: string
  ): Promise<string | null> {
    const terminals = await client.query(
      `SELECT id FROM shop_terminals WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );
    if (terminals.length === 0) return null;

    const nowIso = new Date().toISOString();
    const idleCutoffIso = new Date(Date.now() - POS_TERMINAL_IDLE_MS).toISOString();

    const busyRows = await client.query(
      `SELECT pos_terminal_id FROM user_sessions
       WHERE tenant_id = $1 AND pos_terminal_id IS NOT NULL
         AND expires_at > $2 AND last_activity > $3`,
      [tenantId, nowIso, idleCutoffIso]
    );
    const taken = new Set(
      (busyRows as { pos_terminal_id: string }[]).map((r) => r.pos_terminal_id).filter(Boolean)
    );

    for (const t of terminals as { id: string }[]) {
      if (!taken.has(t.id)) return t.id;
    }
    return null;
  }

  async logout(userId: string, tenantId: string) {
    await this.db.execute('DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
    await this.db.execute('UPDATE users SET login_status = FALSE WHERE id = $1 AND tenant_id = $2', [userId, tenantId]);
  }

  /** Public list of tenants for login company picker (no auth). */
  async listPublicOrganizations(): Promise<
    { id: string; name: string; company_name: string; slug: string | null }[]
  > {
    const rows = await this.db.query(
      `SELECT id, name, company_name, slug FROM tenants
       ORDER BY COALESCE(NULLIF(TRIM(company_name), ''), name) ASC`
    );
    return (rows as { id: string; name: string; company_name: string | null; slug: string | null }[]).map(
      (r) => ({
        id: r.id,
        name: r.name,
        company_name: r.company_name?.trim() || '',
        slug: r.slug,
      })
    );
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

  private async createSession(userId: string, tenantId: string, token: string, posTerminalId: string | null) {
    const sessionId = generateId('session');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.db.execute(
      `INSERT INTO user_sessions (id, user_id, tenant_id, token, expires_at, last_activity, pos_terminal_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (user_id, tenant_id)
       DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, last_activity = NOW(),
         pos_terminal_id = EXCLUDED.pos_terminal_id`,
      [sessionId, userId, tenantId, token, expiresAt, posTerminalId]
    );
  }

  private async createSessionWithClient(
    client: { execute: (sql: string, params?: any[]) => Promise<void> },
    userId: string,
    tenantId: string,
    token: string,
    posTerminalId: string | null
  ) {
    const sessionId = generateId('session');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await client.execute(
      `INSERT INTO user_sessions (id, user_id, tenant_id, token, expires_at, last_activity, pos_terminal_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (user_id, tenant_id)
       DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, last_activity = NOW(),
         pos_terminal_id = EXCLUDED.pos_terminal_id`,
      [sessionId, userId, tenantId, token, expiresAt, posTerminalId]
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
