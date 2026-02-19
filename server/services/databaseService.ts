import { Pool, PoolClient } from 'pg';
import { getCurrentTenantId } from './tenantContext.js';

export class DatabaseService {
  private pool: Pool;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;

    if (!connectionString) {
      console.error('❌ DATABASE_URL is not set!');
      console.error('   Please ensure the .env file contains DATABASE_URL');
    }

    if (connectionString && connectionString.includes('@dpg-') && !connectionString.includes('.render.com')) {
      console.warn('⚠️  WARNING: Database URL appears to be an internal URL (missing .render.com domain)');
      console.warn('   Use the External Database URL from Render Dashboard.');
      console.warn('   Expected format: postgresql://user:pass@dpg-xxx-a.region-postgres.render.com:5432/dbname');
    }

    const shouldUseSSL = process.env.NODE_ENV === 'production' ||
      process.env.NODE_ENV === 'staging' ||
      (connectionString && connectionString.includes('.render.com'));

    console.log(`🔗 Connecting to database (SSL: ${shouldUseSSL ? 'enabled' : 'disabled'})...`);

    this.pool = new Pool({
      connectionString,
      ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      application_name: 'myshop-api',
    });

    this.pool.on('error', (err: any) => {
      console.error('❌ Unexpected database pool error:', err.message);
      if (err.code === 'ECONNREFUSED') {
        console.error('   Make sure the database server is running and accessible');
      }
    });

    this.pool.on('connect', () => {
      console.log('✅ New database connection established');
    });
  }

  async query<T = any>(text: string, params?: any[], retries = 3): Promise<T[]> {
    const startTime = Date.now();
    let lastError: any;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const tenantId = getCurrentTenantId();
        if (!tenantId) {
          const result = await this.pool.query(text, params);
          const duration = Date.now() - startTime;
          if (duration > 500) {
            console.warn(`🐌 SLOW QUERY (${duration}ms):`, { query: text.substring(0, 100), duration });
          }
          return result.rows;
        }

        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          const safeTenantId = String(tenantId).replace(/'/g, "''");
          if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
            throw new Error('Invalid tenant id for SET LOCAL');
          }
          await client.query(`SET LOCAL app.current_tenant_id = '${safeTenantId}'`);
          const result = await client.query(text, params);
          await client.query('COMMIT');
          const duration = Date.now() - startTime;
          if (duration > 500) {
            console.warn(`🐌 SLOW QUERY (${duration}ms):`, { query: text.substring(0, 100), duration, tenantId });
          }
          return result.rows;
        } catch (err) {
          try { await client.query('ROLLBACK'); } catch { /* ignore */ }
          throw err;
        } finally {
          client.release();
        }
      } catch (error: any) {
        lastError = error;
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable || attempt === retries) {
          console.error('❌ Database query error:', { query: text.substring(0, 100), error: error.message, code: error.code, attempt });
          throw error;
        }
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(`⚠️ Query failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  private isRetryableError(error: any): boolean {
    if (!error || !error.code) return false;
    const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '57P02', '57P03', '08003', '08006', '08001', '08004', '53300'];
    return retryableCodes.includes(error.code);
  }

  async execute(text: string, params?: any[], retries = 3): Promise<void> {
    const startTime = Date.now();
    let lastError: any;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const tenantId = getCurrentTenantId();
        if (!tenantId) {
          await this.pool.query(text, params);
          return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
          throw new Error('Invalid tenant id for SET LOCAL');
        }
        const safeTenantId = String(tenantId).replace(/'/g, "''");
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SET LOCAL app.current_tenant_id = '${safeTenantId}'`);
          await client.query(text, params);
          await client.query('COMMIT');
          return;
        } catch (err) {
          try { await client.query('ROLLBACK'); } catch { /* ignore */ }
          throw err;
        } finally {
          client.release();
        }
      } catch (error: any) {
        lastError = error;
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable || attempt === retries) {
          const errorDetails = {
            query: text.substring(0, 100),
            error: error.message,
            code: error.code,
            attempt,
          };
          console.error('❌ Database execute error:', errorDetails);
          
          if (error.message === 'Connection terminated unexpectedly' && attempt === 1) {
            console.error('   This usually means:');
            console.error('   1. The database server is not reachable');
            console.error('   2. Network/firewall is blocking the connection');
            console.error('   3. Database credentials are incorrect');
            console.error('   4. The database is offline or overloaded');
            console.error(`   Connection string host: ${this.connectionString?.split('@')[1]?.split(':')[0]}`);
          }
          
          throw error;
        }
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(`⚠️ Execute failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>, retries = 3): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= retries; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const tenantId = getCurrentTenantId();
        if (tenantId) {
          if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
            throw new Error('Invalid tenant id for SET LOCAL');
          }
          const safeTenantId = String(tenantId).replace(/'/g, "''");
          await client.query(`SET LOCAL app.current_tenant_id = '${safeTenantId}'`);
        }
        const result = await callback(client);
        await client.query('COMMIT');
        client.release();
        return result;
      } catch (error: any) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        client.release();
        lastError = error;
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable || attempt === retries) throw error;
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(`⚠️ Transaction failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }
}

let dbServiceInstance: DatabaseService | null = null;

export function getDatabaseService(): DatabaseService {
  if (!dbServiceInstance) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    dbServiceInstance = new DatabaseService(process.env.DATABASE_URL);
  }
  return dbServiceInstance;
}
