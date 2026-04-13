/**
 * Set expiry_date on every inventory_batches row for one tenant (e.g. OBO Stores).
 *
 * Usage (from server/):
 *   npx tsx scripts/set-tenant-inventory-expiry.ts --tenant-id=<uuid>
 *   npx tsx scripts/set-tenant-inventory-expiry.ts --tenant-id <uuid>
 *   TENANT_ID=<uuid> npx tsx scripts/set-tenant-inventory-expiry.ts
 *   npx tsx scripts/set-tenant-inventory-expiry.ts --tenant-name="obo"
 *   DRY_RUN=1 npx tsx scripts/set-tenant-inventory-expiry.ts --tenant-id=<uuid>
 *   npx tsx scripts/set-tenant-inventory-expiry.ts --list-tenants
 *
 * Env:
 *   DATABASE_URL — required (same as API)
 *   TENANT_ID — target tenant (if not passed on CLI)
 *   TENANT_NAME — partial case-insensitive match on tenants.name (single match required)
 *   EXPIRY_DATE — default 2028-01-01
 *   DRY_RUN=1 — print counts only, no updates
 */

import dotenv from 'dotenv';
import type { Pool } from 'pg';
import { getDatabaseService } from '../services/databaseService.js';

dotenv.config();

const DEFAULT_EXPIRY = '2028-01-01';

function takeOptionalValue(argv: string[], i: number, fromEquals: string): { value: string; nextI: number } {
  let v = fromEquals.trim();
  if (!v && argv[i + 1] && !argv[i + 1].startsWith('--')) {
    return { value: argv[i + 1].trim(), nextI: i + 1 };
  }
  return { value: v, nextI: i };
}

function parseArgs(argv: string[]) {
  let tenantId: string | undefined;
  let tenantName: string | undefined;
  let expiryDate = (process.env.EXPIRY_DATE || DEFAULT_EXPIRY).trim().slice(0, 10);
  let listTenants = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list-tenants') listTenants = true;
    else if (arg === '--tenant-id') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) tenantId = value;
      i = nextI;
    } else if (arg.startsWith('--tenant-id=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--tenant-id='.length));
      if (value) tenantId = value;
      i = nextI;
    } else if (arg === '--tenant-name') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) tenantName = value;
      i = nextI;
    } else if (arg.startsWith('--tenant-name=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--tenant-name='.length));
      if (value) tenantName = value;
      i = nextI;
    } else if (arg === '--expiry') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) expiryDate = value.slice(0, 10);
      i = nextI;
    } else if (arg.startsWith('--expiry=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--expiry='.length));
      if (value) expiryDate = value.slice(0, 10);
      i = nextI;
    }
  }

  if (!tenantId) tenantId = process.env.TENANT_ID?.trim();
  if (!tenantName) tenantName = process.env.TENANT_NAME?.trim();

  return { tenantId, tenantName, expiryDate, listTenants };
}

async function resolveTenantIdPg(
  pool: Pool,
  tenantId: string | undefined,
  tenantName: string | undefined
): Promise<string> {
  if (tenantId) return tenantId;

  if (!tenantName) {
    throw new Error(
      'Provide --tenant-id=<id> or TENANT_ID, or --tenant-name=<substring> / TENANT_NAME (single match). Use --list-tenants to see tenants.'
    );
  }

  const res = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM tenants WHERE LOWER(name) LIKE LOWER($1) ORDER BY name`,
    [`%${tenantName}%`]
  );
  if (res.rows.length === 0) {
    throw new Error(`No tenant matches name pattern: ${tenantName}`);
  }
  if (res.rows.length > 1) {
    const lines = res.rows.map((r) => `  ${r.id}  ${r.name}`).join('\n');
    throw new Error(`Multiple tenants match "${tenantName}". Be more specific or use --tenant-id:\n${lines}`);
  }
  return res.rows[0].id;
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const { tenantId: argTenantId, tenantName, expiryDate, listTenants } = parseArgs(process.argv.slice(2));

  const db = getDatabaseService();

  if (db.getType() === 'sqlite') {
    const tid = argTenantId || process.env.TENANT_ID?.trim();
    if (!tid) {
      throw new Error('SQLite: set TENANT_ID or --tenant-id=<id> (name lookup is not supported).');
    }

    const cntRows = await db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM inventory_batches WHERE tenant_id = $1`,
      [tid]
    );
    const total = Number((cntRows[0] as { c?: number })?.c ?? 0);
    console.log(`SQLite: tenant ${tid} — ${total} inventory_batches row(s) → ${expiryDate} (${dryRun ? 'DRY RUN' : 'APPLY'})`);
    if (total === 0 || dryRun) {
      if (dryRun && total > 0) console.log('DRY_RUN set — no UPDATE executed.');
      await db.close();
      return;
    }
    await db.execute(
      `UPDATE inventory_batches
       SET expiry_date = $1, updated_at = datetime('now')
       WHERE tenant_id = $2`,
      [expiryDate, tid]
    );
    console.log('SQLite: UPDATE completed.');
    await db.close();
    return;
  }

  const pool = db.getPool();
  if (!pool) throw new Error('PostgreSQL pool not available');

  if (listTenants) {
    const r = await pool.query<{ id: string; name: string; company_name: string | null }>(
      `SELECT id, name, company_name FROM tenants ORDER BY name`
    );
    console.log('id\tname\tcompany_name');
    for (const row of r.rows) {
      console.log(`${row.id}\t${row.name}\t${row.company_name ?? ''}`);
    }
    await db.close();
    return;
  }

  const resolvedId = await resolveTenantIdPg(pool, argTenantId, tenantName);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [resolvedId]);

    const countRes = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM inventory_batches WHERE tenant_id = $1`,
      [resolvedId]
    );
    const n = parseInt(countRes.rows[0]?.c ?? '0', 10) || 0;
    console.log(
      `tenant ${resolvedId}: ${n} inventory_batches row(s) → ${expiryDate} (${dryRun ? 'DRY RUN' : 'APPLY'})`
    );

    if (dryRun || n === 0) {
      await client.query('COMMIT');
      if (dryRun && n > 0) console.log('DRY_RUN set — no UPDATE executed. Unset DRY_RUN to apply.');
      return;
    }

    const updateRes = await client.query(
      `UPDATE inventory_batches
       SET expiry_date = $1::date, updated_at = NOW()
       WHERE tenant_id = $2`,
      [expiryDate, resolvedId]
    );
    console.log(`Updated ${updateRes.rowCount ?? 0} row(s).`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
