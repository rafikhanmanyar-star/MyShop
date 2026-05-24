/**
 * Migrate khata ledger (customer credit invoices + payments) between tenants.
 *
 * khata_ledger:
 *   - debit  = invoice / amount owed
 *   - credit = payment received
 *
 * Order:
 *   1. Resolve source contacts → destination contacts (phone, unique name, or create)
 *   2. Insert debits (preserve created_at; order_id mapped by sale_number when possible)
 *   3. Insert credits with remapped linked_debit_id
 *
 * Does NOT copy journal_entries / bank GL (khata balances only). Members/contacts from
 * loyalty migration are reused when phone matches.
 *
 * Usage (from server/):
 *   npx tsx scripts/migrate-khata-between-tenants.ts --list-tenants
 *   npx tsx scripts/migrate-khata-between-tenants.ts
 *   npx tsx scripts/migrate-khata-between-tenants.ts --execute
 *
 * Env: DATABASE_URL, FROM_COMPANY_HINT (default obo), TO_COMPANY_HINT (default obostores)
 */

import dotenv from 'dotenv';
import type { Pool, PoolClient } from 'pg';
import { getDatabaseService } from '../services/databaseService.js';

dotenv.config();

type TenantRow = { id: string; name: string; company_name: string | null };

type ContactRow = {
  id: string;
  name: string;
  type: string;
  contact_no: string | null;
  company_name: string | null;
  address: string | null;
  description: string | null;
};

type KhataRow = {
  id: string;
  customer_id: string;
  order_id: string | null;
  type: 'debit' | 'credit';
  amount: string;
  note: string | null;
  created_at: Date;
  linked_debit_id: string | null;
  sale_number: string | null;
};

type ContactStats = { mapped: number; created: number; skipped: number };
type KhataStats = {
  debitsInserted: number;
  debitsSkipped: number;
  creditsInserted: number;
  creditsSkipped: number;
  errors: number;
};

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

function takeOptionalValue(argv: string[], i: number, fromEquals: string): { value: string; nextI: number } {
  let v = fromEquals.trim();
  if (!v && argv[i + 1] && !argv[i + 1].startsWith('--')) {
    return { value: argv[i + 1].trim(), nextI: i + 1 };
  }
  return { value: v, nextI: i };
}

function parseArgs(argv: string[]) {
  let fromCompany = process.env.FROM_COMPANY_HINT?.trim() || 'obo';
  let toCompany = process.env.TO_COMPANY_HINT?.trim() || 'obostores';
  let fromId: string | undefined;
  let toId: string | undefined;
  let listTenants = false;
  let execute = false;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list-tenants') listTenants = true;
    else if (arg === '--execute') execute = true;
    else if (arg === '--verbose') verbose = true;
    else if (arg === '--from-company') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) fromCompany = value;
      i = nextI;
    } else if (arg.startsWith('--from-company=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--from-company='.length));
      if (value) fromCompany = value;
      i = nextI;
    } else if (arg === '--to-company') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) toCompany = value;
      i = nextI;
    } else if (arg.startsWith('--to-company=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--to-company='.length));
      if (value) toCompany = value;
      i = nextI;
    } else if (arg === '--from-id') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) fromId = value;
      i = nextI;
    } else if (arg.startsWith('--from-id=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--from-id='.length));
      if (value) fromId = value;
      i = nextI;
    } else if (arg === '--to-id') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) toId = value;
      i = nextI;
    } else if (arg.startsWith('--to-id=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--to-id='.length));
      if (value) toId = value;
      i = nextI;
    }
  }

  if (process.env.VERBOSE === '1') verbose = true;
  return { fromCompany, toCompany, fromId, toId, listTenants, execute, verbose };
}

async function setTenantContext(client: PoolClient, tenantId: string) {
  await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
}

async function resolveTenantByHint(
  pool: Pool,
  hint: string | undefined,
  id: string | undefined,
  label: string
): Promise<TenantRow> {
  if (id?.trim()) {
    const r = await pool.query<TenantRow>(
      `SELECT id, name, company_name FROM tenants WHERE id = $1`,
      [id.trim()]
    );
    if (r.rows.length === 0) throw new Error(`${label}: no tenant with id ${id}`);
    return r.rows[0];
  }
  if (!hint?.trim()) throw new Error(`${label}: provide --${label}-id or company hint`);

  const h = hint.trim();
  let r = await pool.query<TenantRow>(
    `SELECT id, name, company_name FROM tenants
     WHERE LOWER(TRIM(company_name)) = LOWER(TRIM($1))
        OR LOWER(TRIM(name)) = LOWER(TRIM($1))
     ORDER BY created_at ASC`,
    [h]
  );
  if (r.rows.length === 0) {
    r = await pool.query<TenantRow>(
      `SELECT id, name, company_name FROM tenants
       WHERE company_name ILIKE $1 OR name ILIKE $1
       ORDER BY created_at ASC`,
      [`%${h}%`]
    );
  }
  if (r.rows.length === 0) throw new Error(`${label}: no tenant matching "${hint}"`);
  if (r.rows.length > 1) {
    const lines = r.rows
      .map((t) => `  ${t.id}  name=${t.name}  company=${t.company_name ?? ''}`)
      .join('\n');
    throw new Error(`${label}: multiple tenants match "${hint}". Use --${label}-id:\n${lines}`);
  }
  return r.rows[0];
}

async function loadDestContactsByPhone(client: PoolClient, destTenantId: string): Promise<Map<string, string>> {
  await setTenantContext(client, destTenantId);
  const r = await client.query<{ id: string; digits: string }>(
    `SELECT id,
            regexp_replace(COALESCE(contact_no, ''), '[^0-9]', '', 'g') AS digits
     FROM contacts
     WHERE tenant_id = $1 AND contact_no IS NOT NULL`,
    [destTenantId]
  );
  const m = new Map<string, string>();
  for (const row of r.rows) {
    if (row.digits && !m.has(row.digits)) m.set(row.digits, row.id);
  }
  return m;
}

async function findUniqueDestContactByName(
  client: PoolClient,
  destTenantId: string,
  name: string
): Promise<string | null> {
  await setTenantContext(client, destTenantId);
  const r = await client.query<{ id: string }>(
    `SELECT id FROM contacts
     WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2::text))`,
    [destTenantId, name]
  );
  if (r.rows.length === 1) return r.rows[0].id;
  return null;
}

async function buildContactIdMap(
  client: PoolClient,
  sourceTenantId: string,
  destTenantId: string,
  dryRun: boolean,
  verbose: boolean
): Promise<{ contactIdMap: Map<string, string>; stats: ContactStats }> {
  const stats: ContactStats = { mapped: 0, created: 0, skipped: 0 };
  const contactIdMap = new Map<string, string>();

  await setTenantContext(client, sourceTenantId);
  const sourceCustomerIds = await client.query<{ customer_id: string }>(
    `SELECT DISTINCT customer_id FROM khata_ledger WHERE tenant_id = $1`,
    [sourceTenantId]
  );

  const destByPhone = await loadDestContactsByPhone(client, destTenantId);

  for (const { customer_id: srcContactId } of sourceCustomerIds.rows) {
    const cRes = await client.query<ContactRow>(
      `SELECT id, name, type, contact_no, company_name, address, description
       FROM contacts WHERE id = $1 AND tenant_id = $2`,
      [srcContactId, sourceTenantId]
    );
    if (cRes.rows.length === 0) {
      stats.skipped++;
      continue;
    }
    const src = cRes.rows[0];
    const digits = phoneDigits(src.contact_no);

    let destId: string | null = null;
    if (digits) destId = destByPhone.get(digits) ?? null;
    if (!destId) destId = await findUniqueDestContactByName(client, destTenantId, src.name);

    if (destId) {
      contactIdMap.set(srcContactId, destId);
      stats.mapped++;
      if (verbose) console.log(`  [contact map] ${src.name} → ${destId}`);
      continue;
    }

    if (dryRun) {
      contactIdMap.set(srcContactId, `__dry__${srcContactId}`);
      stats.created++;
      if (verbose) console.log(`  [contact create] ${src.name} (dry)`);
      continue;
    }

    const newId = generateId('contact');
    await setTenantContext(client, destTenantId);
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, contact_no, company_name, address, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        newId,
        destTenantId,
        src.name,
        src.type,
        src.contact_no,
        src.company_name,
        src.address,
        src.description,
      ]
    );
    if (digits) destByPhone.set(digits, newId);
    contactIdMap.set(srcContactId, newId);
    stats.created++;
    if (verbose) console.log(`  [contact create] ${src.name} → ${newId}`);
  }

  return { contactIdMap, stats };
}

async function loadSaleIdMapByNumber(
  client: PoolClient,
  sourceTenantId: string,
  destTenantId: string
): Promise<Map<string, string>> {
  await setTenantContext(client, sourceTenantId);
  const srcSales = await client.query<{ id: string; sale_number: string }>(
    `SELECT id, sale_number FROM shop_sales WHERE tenant_id = $1`,
    [sourceTenantId]
  );
  if (srcSales.rows.length === 0) return new Map();

  await setTenantContext(client, destTenantId);
  const destSales = await client.query<{ id: string; sale_number: string }>(
    `SELECT id, sale_number FROM shop_sales WHERE tenant_id = $1`,
    [destTenantId]
  );
  const destByNumber = new Map<string, string>();
  for (const row of destSales.rows) {
    destByNumber.set(row.sale_number.trim().toLowerCase(), row.id);
  }

  const map = new Map<string, string>();
  for (const row of srcSales.rows) {
    const destId = destByNumber.get(row.sale_number.trim().toLowerCase());
    if (destId) map.set(row.id, destId);
  }
  return map;
}

async function fetchKhataRows(client: PoolClient, tenantId: string, type: 'debit' | 'credit'): Promise<KhataRow[]> {
  await setTenantContext(client, tenantId);
  const r = await client.query<KhataRow>(
    `SELECT k.id, k.customer_id, k.order_id, k.type, k.amount, k.note, k.created_at, k.linked_debit_id,
            s.sale_number
     FROM khata_ledger k
     LEFT JOIN shop_sales s ON s.id = k.order_id AND s.tenant_id = k.tenant_id
     WHERE k.tenant_id = $1 AND k.type = $2
     ORDER BY k.created_at ASC, k.id ASC`,
    [tenantId, type]
  );
  return r.rows;
}

async function migrateKhata(
  client: PoolClient,
  sourceTenantId: string,
  destTenantId: string,
  contactIdMap: Map<string, string>,
  dryRun: boolean,
  verbose: boolean
): Promise<KhataStats> {
  const stats: KhataStats = {
    debitsInserted: 0,
    debitsSkipped: 0,
    creditsInserted: 0,
    creditsSkipped: 0,
    errors: 0,
  };

  const saleIdMap = await loadSaleIdMapByNumber(client, sourceTenantId, destTenantId);
  const ledgerIdMap = new Map<string, string>();

  const debits = await fetchKhataRows(client, sourceTenantId, 'debit');
  const credits = await fetchKhataRows(client, sourceTenantId, 'credit');

  console.log(`\nSource debits (invoices): ${debits.length}`);
  console.log(`Source credits (payments): ${credits.length}`);
  console.log(`Sale ID mappings (sale_number): ${saleIdMap.size}`);

  console.log('\n--- Phase 2: Debit entries (invoices) ---');

  for (const row of debits) {
    const destCustomerId = contactIdMap.get(row.customer_id);
    if (!destCustomerId || destCustomerId.startsWith('__dry__')) {
      if (dryRun && destCustomerId?.startsWith('__dry__')) {
        stats.debitsInserted++;
        ledgerIdMap.set(row.id, `__dry__${row.id}`);
        continue;
      }
      stats.debitsSkipped++;
      console.warn(`  [skip debit] ${row.id} — customer not mapped`);
      continue;
    }

    let destOrderId: string | null = null;
    if (row.order_id) {
      destOrderId = saleIdMap.get(row.order_id) ?? null;
    }

    if (dryRun) {
      stats.debitsInserted++;
      ledgerIdMap.set(row.id, `__dry__${row.id}`);
      if (verbose) {
        console.log(`  [debit] ${row.amount} ${row.note ?? ''} → customer ${destCustomerId}`);
      }
      continue;
    }

    try {
      const newId = generateId('khata');
      await setTenantContext(client, destTenantId);
      await client.query(
        `INSERT INTO khata_ledger (id, tenant_id, customer_id, order_id, type, amount, note, created_at)
         VALUES ($1, $2, $3, $4, 'debit', $5, $6, $7)`,
        [newId, destTenantId, destCustomerId, destOrderId, row.amount, row.note, row.created_at]
      );
      ledgerIdMap.set(row.id, newId);
      stats.debitsInserted++;
    } catch (err: unknown) {
      stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [debit error] ${row.id}: ${msg}`);
    }
  }

  console.log('\n--- Phase 3: Credit entries (payments) ---');

  for (const row of credits) {
    const destCustomerId = contactIdMap.get(row.customer_id);
    if (!destCustomerId || (dryRun && destCustomerId.startsWith('__dry__'))) {
      if (dryRun && destCustomerId?.startsWith('__dry__')) {
        stats.creditsInserted++;
        continue;
      }
      stats.creditsSkipped++;
      console.warn(`  [skip credit] ${row.id} — customer not mapped`);
      continue;
    }

    let destLinkedDebitId: string | null = null;
    if (row.linked_debit_id) {
      destLinkedDebitId = ledgerIdMap.get(row.linked_debit_id) ?? null;
      if (destLinkedDebitId?.startsWith('__dry__')) destLinkedDebitId = null;
      if (!destLinkedDebitId && !dryRun) {
        console.warn(`  [credit] ${row.id} — linked debit ${row.linked_debit_id} not found; inserting unlinked`);
      }
    }

    if (dryRun) {
      stats.creditsInserted++;
      if (verbose) {
        console.log(`  [credit] ${row.amount} ${row.note ?? ''}`);
      }
      continue;
    }

    try {
      const newId = generateId('khata');
      await setTenantContext(client, destTenantId);
      await client.query(
        `INSERT INTO khata_ledger (id, tenant_id, customer_id, order_id, type, amount, note, linked_debit_id, created_at)
         VALUES ($1, $2, $3, NULL, 'credit', $4, $5, $6, $7)`,
        [newId, destTenantId, destCustomerId, row.amount, row.note, destLinkedDebitId, row.created_at]
      );
      ledgerIdMap.set(row.id, newId);
      stats.creditsInserted++;
    } catch (err: unknown) {
      stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [credit error] ${row.id}: ${msg}`);
    }
  }

  return stats;
}

async function main() {
  const dryRun =
    process.env.DRY_RUN === '1' ||
    process.env.DRY_RUN === 'true' ||
    !process.argv.includes('--execute');
  const args = parseArgs(process.argv.slice(2));

  const db = getDatabaseService();
  if (db.getType() !== 'postgres') {
    throw new Error('This script requires PostgreSQL (DATABASE_URL).');
  }
  const pool = db.getPool();
  if (!pool) throw new Error('PostgreSQL pool not available');

  if (args.listTenants) {
    const r = await pool.query<TenantRow>(
      `SELECT id, name, company_name FROM tenants ORDER BY name`
    );
    console.log('id\tname\tcompany_name');
    for (const row of r.rows) {
      console.log(`${row.id}\t${row.name}\t${row.company_name ?? ''}`);
    }
    await db.close();
    return;
  }

  const fromTenant = await resolveTenantByHint(pool, args.fromCompany, args.fromId, 'from');
  const toTenant = await resolveTenantByHint(pool, args.toCompany, args.toId, 'to');

  if (fromTenant.id === toTenant.id) {
    throw new Error('Source and destination tenants must be different.');
  }

  console.log('=== Khata migration (invoices + payments) ===');
  console.log('Source:', fromTenant);
  console.log('Destination:', toTenant);
  console.log(`Mode: ${dryRun ? 'DRY RUN (pass --execute to apply)' : 'EXECUTE'}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('\n--- Phase 1: Map customers (contacts) ---');
    const { contactIdMap, stats: contactStats } = await buildContactIdMap(
      client,
      fromTenant.id,
      toTenant.id,
      dryRun,
      args.verbose
    );
    console.log('Contact summary:', contactStats);

    const khataStats = await migrateKhata(
      client,
      fromTenant.id,
      toTenant.id,
      contactIdMap,
      dryRun,
      args.verbose
    );

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\nDRY RUN complete — no changes written. Re-run with --execute to apply.');
    } else {
      await client.query('COMMIT');
      console.log('\nMigration committed.');
    }

    console.log('\nKhata summary:', khataStats);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
