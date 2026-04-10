/**
 * Backfill expiry_date on legacy inventory_batches so POS/sales can sell stock
 * that was never dated (NULL), and optionally stock stuck on expired batch rows.
 *
 * Usage (from server/):
 *   npx tsx scripts/backfill-legacy-batch-expiry.ts
 *   DRY_RUN=1 npx tsx scripts/backfill-legacy-batch-expiry.ts
 *   npx tsx scripts/backfill-legacy-batch-expiry.ts --include-expired
 *
 * Env:
 *   DATABASE_URL — required (same as API)
 *   DRY_RUN=1 — print counts only, no updates
 *   EXPIRY_DATE=2026-12-01 — override target date (default: 2026-12-01)
 */

import dotenv from 'dotenv';
import { getDatabaseService } from '../services/databaseService.js';

dotenv.config();

const DEFAULT_EXPIRY = '2026-12-01';

function parseArgs(argv: string[]) {
  const includeExpired = argv.includes('--include-expired');
  return { includeExpired };
}

function wherePg(includeExpired: boolean): string {
  if (includeExpired) {
    return `quantity_remaining > 0 AND (expiry_date IS NULL OR expiry_date < CURRENT_DATE)`;
  }
  return `quantity_remaining > 0 AND expiry_date IS NULL`;
}

function whereSqlite(includeExpired: boolean): string {
  if (includeExpired) {
    return `quantity_remaining > 0 AND (expiry_date IS NULL OR expiry_date < date('now'))`;
  }
  return `quantity_remaining > 0 AND expiry_date IS NULL`;
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const expiryDate = (process.env.EXPIRY_DATE || DEFAULT_EXPIRY).trim().slice(0, 10);
  const { includeExpired } = parseArgs(process.argv.slice(2));

  const db = getDatabaseService();
  const wPg = wherePg(includeExpired);
  const wSqlite = whereSqlite(includeExpired);

  console.log(
    `Legacy batch expiry backfill → ${expiryDate} (${dryRun ? 'DRY RUN' : 'APPLY'})` +
      (includeExpired ? ', including rows with past expiry_date' : ', NULL expiry_date only')
  );

  if (db.getType() === 'sqlite') {
    const cntRows = await db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM inventory_batches WHERE ${wSqlite}`
    );
    const totalBefore = Number((cntRows[0] as { c?: number })?.c ?? 0);
    console.log(`SQLite: matching batch rows: ${totalBefore}`);
    if (totalBefore === 0) {
      await db.close();
      return;
    }
    if (dryRun) {
      console.log('DRY_RUN set — no UPDATE executed.');
      await db.close();
      return;
    }
    await db.execute(
      `UPDATE inventory_batches
       SET expiry_date = $1, updated_at = datetime('now')
       WHERE ${wSqlite}`,
      [expiryDate]
    );
    console.log('SQLite: UPDATE completed.');
    await db.close();
    return;
  }

  const pool = db.getPool();
  if (!pool) {
    throw new Error('PostgreSQL pool not available');
  }

  const tenantList = await pool.query<{ id: string }>('SELECT id FROM tenants ORDER BY id');
  const tenantIds = tenantList.rows.map((r) => r.id).filter(Boolean);

  if (tenantIds.length === 0) {
    console.log('No tenants found.');
    await db.close();
    return;
  }

  let totalMatch = 0;
  let totalUpdated = 0;

  for (const tenantId of tenantIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      const countRes = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM inventory_batches WHERE tenant_id = $1 AND ${wPg}`,
        [tenantId]
      );
      const n = parseInt(countRes.rows[0]?.c ?? '0', 10) || 0;
      if (n === 0) {
        await client.query('COMMIT');
        continue;
      }
      totalMatch += n;
      console.log(`tenant ${tenantId}: ${n} batch row(s)`);

      if (!dryRun) {
        const updateRes = await client.query(
          `UPDATE inventory_batches
           SET expiry_date = $1::date, updated_at = NOW()
           WHERE tenant_id = $2 AND ${wPg}`,
          [expiryDate, tenantId]
        );
        const u = updateRes.rowCount ?? 0;
        totalUpdated += u;
        console.log(`  → updated ${u}`);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`Total matching rows: ${totalMatch}`);
  if (!dryRun) {
    console.log(`Total updated rows: ${totalUpdated}`);
  }
  if (dryRun) {
    console.log('DRY_RUN set — no UPDATE executed. Unset DRY_RUN to apply.');
  }

  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
