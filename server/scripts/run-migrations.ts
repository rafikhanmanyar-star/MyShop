import { getDatabaseService } from '../services/databaseService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  if (process.env.DISABLE_MIGRATIONS === 'true') {
    console.log('⏭️ Migrations disabled via DISABLE_MIGRATIONS=true');
    return;
  }

  const db = getDatabaseService();
  const dbType = db.getType();

  // Ensure schema_migrations table exists
  const nowFunc = dbType === 'sqlite' ? 'CURRENT_TIMESTAMP' : 'NOW()';
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT ${nowFunc},
      execution_time_ms INTEGER
    )
  `);

  const migrationsDir = path.resolve(__dirname, '../migrations');

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .filter(f => !f.includes('.sqlite.sql'))
    .sort();

  for (const file of files) {
    let migrationFile = file;
    if (dbType === 'sqlite') {
      const sqliteSpecific = file.replace('.sql', '.sqlite.sql');
      if (fs.existsSync(path.join(migrationsDir, sqliteSpecific))) {
        migrationFile = sqliteSpecific;
      }
    } else {
      // If we are on Postgres, skip any file that is explicitly for sqlite
      if (file.includes('.sqlite.sql')) {
        continue;
      }
    }

    const rows = await db.query('SELECT name FROM schema_migrations WHERE name = $1', [file]);
    if (rows.length > 0) {
      console.log(`⏭️ Already applied: ${file}`);
      continue;
    }

    console.log(`🔄 Applying migration: ${migrationFile}`);
    const startTime = Date.now();
    let sql = fs.readFileSync(path.join(migrationsDir, migrationFile), 'utf-8');

    if (dbType === 'sqlite' && migrationFile === file) {
      // Basic cleaning for SQLite if no specific file found
      sql = sql
        .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/gi, '')
        // Simpler UUID default for SQLite or just remove it and let indices work
        .replace(/DEFAULT uuid_generate_v4\(\)/gi, '')
        .replace(/uuid_generate_v4\(\)/gi, 'lower(hex(randomblob(16)))')
        .replace(/JSONB/gi, 'TEXT')
        .replace(/TIMESTAMP NOT NULL DEFAULT NOW\(\)/gi, 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP')
        .replace(/TIMESTAMP DEFAULT NOW\(\)/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP')
        .replace(/SERIAL/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
        .replace(/DECIMAL\(\d+,\s*\d+\)/gi, 'NUMERIC')
        .replace(/ON DELETE SET NULL/gi, '') // SQLite has some limits on this sometimes depending on schema
        .replace(/ILIKE/gi, 'LIKE');

      // Remove RLS blocks
      sql = sql.replace(/ALTER TABLE .* ENABLE ROW LEVEL SECURITY;/gi, '');
      sql = sql.replace(/DROP POLICY IF EXISTS .* ON .*;/gi, '');
      sql = sql.replace(/CREATE POLICY .* ON .* FOR ALL USING .* WITH CHECK .*; /gi, '');
      sql = sql.replace(/DO \$\$[\s\S]*?END \$\$;/gi, '');
      sql = sql.replace(/CREATE OR REPLACE FUNCTION .*? END; \$\$ LANGUAGE sql STABLE;/gis, '');

      // SQLite doesn't support multiple columns in UNIQUE sometimes if they are TEXT? No, it does.
      // But it doesn't like some PG indices.
      sql = sql.replace(/CREATE INDEX IF NOT EXISTS .* ON .*\(\);\s*/gi, '');
    }

    try {
      if (dbType === 'sqlite') {
        // Step-by-step execution for SQLite to avoid issues with complex scripts
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try {
            await db.execute(stmt);
          } catch (e: any) {
            console.warn(`  ⚠️  Statement failed, skipping: ${stmt.substring(0, 50)}... ${e.message}`);
          }
        }
      } else {
        await db.execute(sql);
      }

      const executionTime = Date.now() - startTime;
      await db.execute(
        'INSERT INTO schema_migrations (name, execution_time_ms) VALUES ($1, $2)',
        [file, executionTime]
      );
      console.log(`✅ Applied: ${file} (${executionTime}ms)`);
    } catch (error: any) {
      console.error(`❌ Migration failed: ${migrationFile}`, error);
      throw error;
    }
  }

  console.log('✅ All migrations complete');
}
