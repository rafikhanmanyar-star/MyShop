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

  // Ensure schema_migrations table exists
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
      execution_time_ms INTEGER
    )
  `);

  const migrationsDir = path.resolve(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const applied = await db.query('SELECT name FROM schema_migrations WHERE name = $1', [file]);
    if (applied.length > 0) {
      console.log(`⏭️ Already applied: ${file}`);
      continue;
    }

    console.log(`🔄 Applying migration: ${file}`);
    const startTime = Date.now();
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    try {
      await db.execute(sql);
      const executionTime = Date.now() - startTime;
      await db.execute(
        'INSERT INTO schema_migrations (name, execution_time_ms) VALUES ($1, $2)',
        [file, executionTime]
      );
      console.log(`✅ Applied: ${file} (${executionTime}ms)`);
    } catch (error: any) {
      console.error(`❌ Migration failed: ${file}`, error.message);
      throw error;
    }
  }

  console.log('✅ All migrations complete');
}
