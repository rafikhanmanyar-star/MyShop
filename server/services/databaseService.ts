import { Pool } from 'pg';
import Database from 'better-sqlite3';
import { getCurrentTenantId } from './tenantContext.js';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface IDatabaseService {
  query<T = any>(text: string, params?: any[]): Promise<T[]>;
  execute(text: string, params?: any[]): Promise<void>;
  transaction<T>(callback: (client: any) => Promise<T>): Promise<T>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
  getType(): 'postgres' | 'sqlite';
}

export class DatabaseService implements IDatabaseService {
  private pgPool: Pool | null = null;
  private sqliteDb: any | null = null;
  private type: 'postgres' | 'sqlite' = 'postgres';
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;

    if (!connectionString) {
      console.error('❌ DATABASE_URL is not set!');
      return;
    }

    if (connectionString.startsWith('sqlite://')) {
      this.type = 'sqlite';
      const dbPath = connectionString.replace('sqlite://', '');
      console.log(`🔗 Connecting to SQLite database at ${dbPath}...`);
      this.sqliteDb = new Database(dbPath);
      this.sqliteDb.pragma('journal_mode = WAL');
      this.sqliteDb.pragma('foreign_keys = ON');
    } else {
      this.type = 'postgres';
      const shouldUseSSL = process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging' ||
        (connectionString && connectionString.includes('.render.com'));

      console.log(`🔗 Connecting to PostgreSQL database (SSL: ${shouldUseSSL ? 'enabled' : 'disabled'})...`);

      this.pgPool = new Pool({
        connectionString,
        ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      this.pgPool.on('error', (err: any) => {
        console.error('❌ Unexpected database pool error:', err.message);
      });
    }
  }

  getType() { return this.type; }

  private convertParamsForSqlite(params: any[]): any {
    const obj: any = {};
    params.forEach((p, i) => {
      let val = p;
      if (typeof p === 'boolean') val = p ? 1 : 0;
      if (p instanceof Date) val = p.toISOString();
      obj[`p${i + 1}`] = val;
    });
    return obj;
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const tenantId = getCurrentTenantId();

    if (this.type === 'sqlite') {
      const sql = this.convertPgToSqlite(text);
      const stmt = this.sqliteDb.prepare(sql);
      const safeParams = this.convertParamsForSqlite(params || []);
      try {
        return stmt.all(safeParams) as T[];
      } catch (err: any) {
        if (err.message.includes('This statement does not return data')) {
          stmt.run(safeParams);
          return [];
        }
        throw err;
      }
    } else {
      const client = await this.pgPool!.connect();
      try {
        if (tenantId) {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
          const result = await client.query(text, params);
          await client.query('COMMIT');
          return result.rows;
        } else {
          const result = await client.query(text, params);
          return result.rows;
        }
      } catch (err) {
        if (tenantId) await client.query('ROLLBACK').catch(() => { });
        throw err;
      } finally {
        client.release();
      }
    }
  }

  async execute(text: string, params?: any[]): Promise<void> {
    if (this.type === 'sqlite') {
      const sql = this.convertPgToSqlite(text);
      const safeParams = this.convertParamsForSqlite(params || []);
      this.sqliteDb.prepare(sql).run(safeParams);
    } else {
      await this.query(text, params);
    }
  }

  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    if (this.type === 'sqlite') {
      const wrapper = {
        query: async (sql: string, params?: any[]) => {
          const converted = this.convertPgToSqlite(sql);
          const stmt = this.sqliteDb.prepare(converted);
          const safeParams = this.convertParamsForSqlite(params || []);
          try {
            return stmt.all(safeParams);
          } catch (err: any) {
            if (err.message.includes('This statement does not return data')) {
              stmt.run(safeParams);
              return [];
            }
            throw err;
          }
        },
        execute: async (sql: string, params?: any[]) => {
          const converted = this.convertPgToSqlite(sql);
          const safeParams = this.convertParamsForSqlite(params || []);
          this.sqliteDb.prepare(converted).run(safeParams);
        }
      };

      this.sqliteDb.prepare('BEGIN').run();
      try {
        const result = await callback(wrapper);
        this.sqliteDb.prepare('COMMIT').run();
        return result;
      } catch (err) {
        this.sqliteDb.prepare('ROLLBACK').run();
        throw err;
      }
    } else {
      const client = await this.pgPool!.connect();
      try {
        await client.query('BEGIN');
        const tenantId = getCurrentTenantId();
        if (tenantId) {
          await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
        }

        const wrapper = {
          query: async (sql: string, params?: any[]) => {
            const res = await client.query(sql, params);
            return res.rows;
          },
          execute: async (sql: string, params?: any[]) => {
            await client.query(sql, params);
          }
        };

        const result = await callback(wrapper);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (this.type === 'sqlite') {
        this.sqliteDb.prepare('SELECT 1').get();
        return true;
      } else {
        await this.pgPool!.query('SELECT 1');
        return true;
      }
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.sqliteDb) this.sqliteDb.close();
    if (this.pgPool) await this.pgPool.end();
  }

  private convertPgToSqlite(sql: string): string {
    // Basic conversion from $1, $2 to @p1, @p2 for SQLite named parameters
    return sql.replace(/\$(\d+)/g, '@p$1')
      .replace(/NOW\(\)/gi, "datetime('now')")
      .replace(/SERIAL/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  }

  // Helper for PG specific features if needed
  getPool(): Pool | null {
    return this.pgPool;
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
