import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from './databaseService.js';

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

    return { token, tenantId, userId, username: data.username, role: 'admin', name: data.name };
  }

  async login(data: { username: string; password: string }) {
    const users = await this.db.query(
      `SELECT u.id, u.tenant_id, u.username, u.name, u.role, u.password, u.is_active
       FROM users u WHERE u.username = $1`,
      [data.username]
    );

    if (users.length === 0) {
      throw new Error('Invalid username or password');
    }

    const user = users[0];
    if (!user.is_active) {
      throw new Error('Account is deactivated. Contact your administrator.');
    }

    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      throw new Error('Invalid username or password');
    }

    const token = this.generateToken(user.id, user.tenant_id, user.username, user.role);
    await this.createSession(user.id, user.tenant_id, token);

    await this.db.execute('UPDATE users SET login_status = TRUE WHERE id = $1', [user.id]);

    return {
      token,
      tenantId: user.tenant_id,
      userId: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    };
  }

  async logout(userId: string, tenantId: string) {
    await this.db.execute('DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
    await this.db.execute('UPDATE users SET login_status = FALSE WHERE id = $1', [userId]);
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
