/**
 * Migrate suppliers (shop_vendors) and loyalty members from one tenant to another.
 *
 * Order (required for FK integrity):
 *   1. Suppliers (shop_vendors) — matched by normalized name + company_name
 *   2. Loyalty members (shop_loyalty_members) — contacts resolved/created by phone, then members
 *
 * Usage (from server/):
 *   npx tsx scripts/migrate-suppliers-and-loyalty-between-tenants.ts --list-tenants
 *   npx tsx scripts/migrate-suppliers-and-loyalty-between-tenants.ts
 *   npx tsx scripts/migrate-suppliers-and-loyalty-between-tenants.ts --execute
 *   npx tsx scripts/migrate-suppliers-and-loyalty-between-tenants.ts --update-existing --execute
 *   npx tsx scripts/migrate-suppliers-and-loyalty-between-tenants.ts --suppliers-only --execute
 *   npx tsx scripts/migrate-suppliers-and-loyalty-between-tenants.ts --loyalty-only --execute
 *
 * Env:
 *   DATABASE_URL — required (PostgreSQL)
 *   FROM_COMPANY_HINT — default "obo"
 *   TO_COMPANY_HINT — default "obostores"
 *   DRY_RUN=1 — report only (default unless --execute)
 *   VERBOSE=1 — log each row
 */

import dotenv from 'dotenv';
import type { Pool, PoolClient } from 'pg';
import { getDatabaseService } from '../services/databaseService.js';

dotenv.config();

type TenantRow = { id: string; name: string; company_name: string | null };

type VendorRow = {
  id: string;
  name: string;
  company_name: string | null;
  contact_no: string | null;
  email: string | null;
  address: string | null;
  description: string | null;
  is_active: boolean | null;
};

type LoyaltySourceRow = {
  id: string;
  customer_id: string;
  card_number: string;
  tier: string;
  points_balance: number;
  lifetime_points: number;
  total_spend: string;
  visit_count: number;
  status: string;
  joined_at: Date;
  mobile_customer_verified: boolean;
  customer_name: string;
  contact_no: string | null;
  contact_type: string;
  contact_company_name: string | null;
  contact_address: string | null;
  contact_description: string | null;
};

type VendorStats = { inserted: number; linked: number; updated: number; skipped: number };
type LoyaltyStats = {
  contactsInserted: number;
  contactsLinked: number;
  membersInserted: number;
  membersLinked: number;
  membersUpdated: number;
  skippedNoPhone: number;
  errors: number;
};

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
  let updateExisting = false;
  let suppliersOnly = false;
  let loyaltyOnly = false;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list-tenants') listTenants = true;
    else if (arg === '--execute') execute = true;
    else if (arg === '--update-existing') updateExisting = true;
    else if (arg === '--suppliers-only') suppliersOnly = true;
    else if (arg === '--loyalty-only') loyaltyOnly = true;
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

  const migrateSuppliers = !loyaltyOnly;
  const migrateLoyalty = !suppliersOnly;

  return {
    fromCompany,
    toCompany,
    fromId,
    toId,
    listTenants,
    execute,
    updateExisting,
    migrateSuppliers,
    migrateLoyalty,
    verbose,
  };
}

function vendorDestKey(name: string, companyName: string | null | undefined): string {
  return `${name.trim().toLowerCase()}::${(companyName ?? '').trim().toLowerCase()}`;
}

function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
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
  if (!hint?.trim()) throw new Error(`${label}: provide --${label}-id or --${label}-company`);

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

async function loadDestVendorKeys(client: PoolClient, destTenantId: string): Promise<Map<string, string>> {
  await setTenantContext(client, destTenantId);
  const r = await client.query<{ id: string; name: string; company_name: string | null }>(
    `SELECT id, name, company_name FROM shop_vendors WHERE tenant_id = $1`,
    [destTenantId]
  );
  const m = new Map<string, string>();
  for (const row of r.rows) {
    m.set(vendorDestKey(row.name, row.company_name), row.id);
  }
  return m;
}

async function migrateSuppliers(
  client: PoolClient,
  sourceTenantId: string,
  destTenantId: string,
  dryRun: boolean,
  updateExisting: boolean,
  verbose: boolean
): Promise<VendorStats> {
  const stats: VendorStats = { inserted: 0, linked: 0, updated: 0, skipped: 0 };

  await setTenantContext(client, sourceTenantId);
  const source = await client.query<VendorRow>(
    `SELECT id, name, company_name, contact_no, email, address, description, is_active
     FROM shop_vendors WHERE tenant_id = $1 ORDER BY name ASC`,
    [sourceTenantId]
  );

  const destByKey = await loadDestVendorKeys(client, destTenantId);

  console.log('\n=== Phase 1: Suppliers (shop_vendors) ===');
  console.log(`Source suppliers: ${source.rows.length}`);
  console.log(`Destination suppliers already present: ${destByKey.size}`);

  for (const src of source.rows) {
    const name = src.name.trim();
    if (!name) {
      stats.skipped++;
      continue;
    }

    const key = vendorDestKey(name, src.company_name);
    const existingDestId = destByKey.get(key);

    if (existingDestId) {
      if (updateExisting && !dryRun) {
        await setTenantContext(client, destTenantId);
        await client.query(
          `UPDATE shop_vendors SET
             contact_no = $3, email = $4, address = $5, description = $6,
             is_active = COALESCE($7, is_active), updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [
            existingDestId,
            destTenantId,
            src.contact_no,
            src.email,
            src.address,
            src.description,
            src.is_active,
          ]
        );
        stats.updated++;
        if (verbose) console.log(`  [supplier update] ${name}`);
      } else {
        stats.linked++;
        if (verbose) console.log(`  [supplier link] ${name} → ${existingDestId}`);
      }
      continue;
    }

    if (dryRun) {
      stats.inserted++;
      destByKey.set(key, `__dry__${src.id}`);
      if (verbose) console.log(`  [supplier insert] ${name}`);
      continue;
    }

    await setTenantContext(client, destTenantId);
    const ins = await client.query<{ id: string }>(
      `INSERT INTO shop_vendors (tenant_id, name, company_name, contact_no, email, address, description, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE)) RETURNING id`,
      [
        destTenantId,
        name,
        src.company_name,
        src.contact_no,
        src.email,
        src.address,
        src.description,
        src.is_active,
      ]
    );
    const newId = ins.rows[0].id;
    destByKey.set(key, newId);
    stats.inserted++;
    if (verbose) console.log(`  [supplier insert] ${name} → ${newId}`);
  }

  console.log('Supplier summary:', stats);
  return stats;
}

async function findDestContactByPhone(
  client: PoolClient,
  destTenantId: string,
  digits: string
): Promise<string | null> {
  if (!digits) return null;

  await setTenantContext(client, destTenantId);
  const r = await client.query<{ id: string }>(
    `SELECT id FROM contacts
     WHERE tenant_id = $1 AND contact_no IS NOT NULL
       AND regexp_replace(COALESCE(contact_no, ''), '[^0-9]', '', 'g') = $2
       AND length($2) > 0
     LIMIT 1`,
    [destTenantId, digits]
  );
  return r.rows[0]?.id ?? null;
}

async function findDestLoyaltyByCard(
  client: PoolClient,
  destTenantId: string,
  cardNumber: string
): Promise<string | null> {
  await setTenantContext(client, destTenantId);
  const r = await client.query<{ id: string }>(
    `SELECT id FROM shop_loyalty_members
     WHERE tenant_id = $1 AND LOWER(TRIM(card_number)) = LOWER(TRIM($2::text))
     LIMIT 1`,
    [destTenantId, cardNumber]
  );
  return r.rows[0]?.id ?? null;
}

async function findDestLoyaltyByCustomer(
  client: PoolClient,
  destTenantId: string,
  customerId: string
): Promise<string | null> {
  await setTenantContext(client, destTenantId);
  const r = await client.query<{ id: string }>(
    `SELECT id FROM shop_loyalty_members WHERE tenant_id = $1 AND customer_id = $2 LIMIT 1`,
    [destTenantId, customerId]
  );
  return r.rows[0]?.id ?? null;
}

async function resolveOrCreateDestContact(
  client: PoolClient,
  destTenantId: string,
  src: LoyaltySourceRow,
  dryRun: boolean,
  updateExisting: boolean,
  stats: LoyaltyStats
): Promise<string | null> {
  const digits = phoneDigits(src.contact_no);
  if (!digits) return null;

  let destContactId = await findDestContactByPhone(client, destTenantId, digits);

  if (destContactId) {
    stats.contactsLinked++;
    if (updateExisting && !dryRun) {
      await setTenantContext(client, destTenantId);
      await client.query(
        `UPDATE contacts SET
           name = $3, type = $4, company_name = $5, address = $6, description = $7, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [
          destContactId,
          destTenantId,
          src.customer_name,
          src.contact_type || 'Customer',
          src.contact_company_name,
          src.contact_address,
          src.contact_description,
        ]
      );
    }
    return destContactId;
  }

  if (dryRun) {
    stats.contactsInserted++;
    return `__dry_contact__${src.customer_id}`;
  }

  const newContactId = generateId('contact');
  await setTenantContext(client, destTenantId);
  await client.query(
    `INSERT INTO contacts (id, tenant_id, name, type, contact_no, company_name, address, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      newContactId,
      destTenantId,
      src.customer_name,
      src.contact_type || 'Customer',
      src.contact_no,
      src.contact_company_name,
      src.contact_address,
      src.contact_description,
    ]
  );
  stats.contactsInserted++;
  return newContactId;
}

async function upsertDestLoyaltyMember(
  client: PoolClient,
  destTenantId: string,
  destCustomerId: string,
  src: LoyaltySourceRow,
  existingMemberId: string | null,
  dryRun: boolean,
  updateExisting: boolean,
  stats: LoyaltyStats,
  verbose: boolean
) {
  if (existingMemberId) {
    if (!updateExisting) {
      stats.membersLinked++;
      if (verbose) {
        console.log(`  [loyalty link] ${src.card_number} (${src.customer_name}) → ${existingMemberId}`);
      }
      return;
    }
    if (dryRun) {
      stats.membersUpdated++;
      return;
    }
    await setTenantContext(client, destTenantId);
    await client.query(
      `UPDATE shop_loyalty_members SET
         tier = $3, points_balance = $4, lifetime_points = $5, total_spend = $6,
         visit_count = $7, status = $8, mobile_customer_verified = $9,
         joined_at = $10, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [
        existingMemberId,
        destTenantId,
        src.tier,
        src.points_balance,
        src.lifetime_points,
        src.total_spend,
        src.visit_count,
        src.status,
        src.mobile_customer_verified,
        src.joined_at,
      ]
    );
    stats.membersUpdated++;
    if (verbose) {
      console.log(`  [loyalty update] ${src.card_number} (${src.customer_name})`);
    }
    return;
  }

  if (dryRun) {
    stats.membersInserted++;
    if (verbose) {
      console.log(`  [loyalty insert] ${src.card_number} (${src.customer_name})`);
    }
    return;
  }

  await setTenantContext(client, destTenantId);
  let cardNumber = src.card_number.trim();
  for (let attempt = 0; attempt < 5; attempt++) {
    const tryCard = attempt === 0 ? cardNumber : `${cardNumber}-${attempt}`;
    try {
      await client.query(
        `INSERT INTO shop_loyalty_members (
           tenant_id, customer_id, card_number, tier, points_balance, lifetime_points,
           total_spend, visit_count, status, mobile_customer_verified, joined_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          destTenantId,
          destCustomerId,
          tryCard,
          src.tier,
          src.points_balance,
          src.lifetime_points,
          src.total_spend,
          src.visit_count,
          src.status,
          src.mobile_customer_verified,
          src.joined_at,
        ]
      );
      stats.membersInserted++;
      if (verbose) {
        console.log(`  [loyalty insert] ${tryCard} (${src.customer_name})`);
      }
      return;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === '23505' && attempt < 4) continue;
      const byCustomer = await findDestLoyaltyByCustomer(client, destTenantId, destCustomerId);
      if (byCustomer) {
        stats.membersLinked++;
        return;
      }
      throw e;
    }
  }
}

async function migrateLoyaltyMembers(
  client: PoolClient,
  sourceTenantId: string,
  destTenantId: string,
  dryRun: boolean,
  updateExisting: boolean,
  verbose: boolean
): Promise<LoyaltyStats> {
  const stats: LoyaltyStats = {
    contactsInserted: 0,
    contactsLinked: 0,
    membersInserted: 0,
    membersLinked: 0,
    membersUpdated: 0,
    skippedNoPhone: 0,
    errors: 0,
  };

  await setTenantContext(client, sourceTenantId);
  const source = await client.query<LoyaltySourceRow>(
    `SELECT
       m.id, m.customer_id, m.card_number, m.tier, m.points_balance, m.lifetime_points,
       m.total_spend, m.visit_count, m.status, m.joined_at,
       COALESCE(m.mobile_customer_verified, FALSE) AS mobile_customer_verified,
       c.name AS customer_name, c.contact_no, c.type AS contact_type,
       c.company_name AS contact_company_name, c.address AS contact_address,
       c.description AS contact_description
     FROM shop_loyalty_members m
     INNER JOIN contacts c ON c.id = m.customer_id AND c.tenant_id = m.tenant_id
     WHERE m.tenant_id = $1
     ORDER BY c.name ASC`,
    [sourceTenantId]
  );

  console.log('\n=== Phase 2: Loyalty members (contacts + shop_loyalty_members) ===');
  console.log(`Source loyalty members: ${source.rows.length}`);

  for (const src of source.rows) {
    const digits = phoneDigits(src.contact_no);
    if (!digits) {
      stats.skippedNoPhone++;
      console.warn(
        `  [skip] ${src.customer_name} (card ${src.card_number}) — contact has no phone; create manually on destination`
      );
      continue;
    }

    try {
      const destCustomerId = await resolveOrCreateDestContact(
        client,
        destTenantId,
        src,
        dryRun,
        updateExisting,
        stats
      );
      if (!destCustomerId) {
        stats.skippedNoPhone++;
        continue;
      }
      if (dryRun && destCustomerId.startsWith('__dry_contact__')) {
        // continue with dry-run member insert
      }

      let existingMemberId: string | null = null;
      if (!dryRun || !destCustomerId.startsWith('__dry_contact__')) {
        if (!dryRun) {
          existingMemberId =
            (await findDestLoyaltyByCard(client, destTenantId, src.card_number)) ??
            (await findDestLoyaltyByCustomer(client, destTenantId, destCustomerId));
        }
      } else {
        existingMemberId = null;
      }

      await upsertDestLoyaltyMember(
        client,
        destTenantId,
        destCustomerId,
        src,
        existingMemberId,
        dryRun,
        updateExisting,
        stats,
        verbose
      );
    } catch (err: unknown) {
      stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [loyalty error] ${src.card_number} (${src.customer_name}): ${msg}`);
    }
  }

  console.log('Loyalty summary:', stats);
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

  console.log('=== Suppliers & loyalty migration ===');
  console.log('Source:', fromTenant);
  console.log('Destination:', toTenant);
  console.log(`Mode: ${dryRun ? 'DRY RUN (pass --execute to apply)' : 'EXECUTE'}`);
  console.log(
    `Options: migrateSuppliers=${args.migrateSuppliers}, migrateLoyalty=${args.migrateLoyalty}, updateExisting=${args.updateExisting}`
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let vendorStats: VendorStats | undefined;
    let loyaltyStats: LoyaltyStats | undefined;

    if (args.migrateSuppliers) {
      vendorStats = await migrateSuppliers(
        client,
        fromTenant.id,
        toTenant.id,
        dryRun,
        args.updateExisting,
        args.verbose
      );
    }

    if (args.migrateLoyalty) {
      loyaltyStats = await migrateLoyaltyMembers(
        client,
        fromTenant.id,
        toTenant.id,
        dryRun,
        args.updateExisting,
        args.verbose
      );
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\nDRY RUN complete — no changes written. Re-run with --execute to apply.');
    } else {
      await client.query('COMMIT');
      console.log('\nMigration committed.');
    }

    if (vendorStats) console.log('\nFinal supplier stats:', vendorStats);
    if (loyaltyStats) {
      console.log('\nFinal loyalty stats:', loyaltyStats);
      if (loyaltyStats.skippedNoPhone > 0) {
        console.log(
          `\nNote: ${loyaltyStats.skippedNoPhone} member(s) skipped (no phone on contact). Add phone on source or create loyalty manually on destination.`
        );
      }
    }
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
