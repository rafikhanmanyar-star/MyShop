/**
 * Copy inventory (stock) from one tenant to another, matched by product SKU.
 *
 * Use when catalog already exists on the destination (e.g. obostores) and you only
 * need quantities / batches aligned with the source tenant (e.g. oBo / obo).
 *
 * Copies:
 *   - shop_inventory (quantity_on_hand, quantity_reserved) per warehouse
 *   - inventory_batches (optional, when --with-batches)
 *
 * Warehouses are matched by warehouse `code`; missing dest warehouses are created.
 *
 * Usage (from server/):
 *   npx tsx scripts/migrate-inventory-between-tenants.ts --list-tenants
 *   npx tsx scripts/migrate-inventory-between-tenants.ts
 *   npx tsx scripts/migrate-inventory-between-tenants.ts --execute
 *   npx tsx scripts/migrate-inventory-between-tenants.ts --execute --replace-batches
 *   npx tsx scripts/migrate-inventory-between-tenants.ts --execute --sku BEV-001
 *
 * Env:
 *   DATABASE_URL — required (PostgreSQL)
 *   FROM_COMPANY_HINT — default "obo"
 *   TO_COMPANY_HINT — default "obostores"
 *   DRY_RUN=1 — report only (default unless --execute)
 *   VERBOSE=1 — log each SKU
 */

import dotenv from 'dotenv';
import type { Pool, PoolClient } from 'pg';
import { getDatabaseService } from '../services/databaseService.js';

dotenv.config();

type TenantRow = { id: string; name: string; company_name: string | null };

type MigrateStats = {
  sourceProducts: number;
  matched: number;
  updated: number;
  skippedNoDestSku: number;
  skippedNoSourceStock: number;
  inventoryRowsUpserted: number;
  batchesCopied: number;
  batchesReplaced: number;
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
  let withBatches = true;
  let replaceBatches = false;
  let skuFilter: string | undefined;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list-tenants') listTenants = true;
    else if (arg === '--execute') execute = true;
    else if (arg === '--verbose') verbose = true;
    else if (arg === '--no-batches') withBatches = false;
    else if (arg === '--replace-batches') replaceBatches = true;
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
    } else if (arg === '--sku') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) skuFilter = value;
      i = nextI;
    } else if (arg.startsWith('--sku=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--sku='.length));
      if (value) skuFilter = value;
      i = nextI;
    }
  }

  if (process.env.VERBOSE === '1') verbose = true;

  return {
    fromCompany,
    toCompany,
    fromId,
    toId,
    listTenants,
    execute,
    withBatches,
    replaceBatches,
    skuFilter,
    verbose,
  };
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

async function ensureDestWarehouse(client: PoolClient, destTenantId: string): Promise<string> {
  await setTenantContext(client, destTenantId);
  const wh = await client.query<{ id: string }>(
    `SELECT id FROM shop_warehouses WHERE tenant_id = $1 ORDER BY code ASC LIMIT 1`,
    [destTenantId]
  );
  if (wh.rows.length > 0) return wh.rows[0].id;

  const ins = await client.query<{ id: string }>(
    `INSERT INTO shop_warehouses (tenant_id, name, code, location, is_active)
     VALUES ($1, 'Main Warehouse', 'MAIN', 'Migrated default', TRUE) RETURNING id`,
    [destTenantId]
  );
  return ins.rows[0].id;
}

async function loadWarehouseCodeById(
  client: PoolClient,
  tenantId: string
): Promise<Map<string, string>> {
  await setTenantContext(client, tenantId);
  const r = await client.query<{ id: string; code: string }>(
    `SELECT id, code FROM shop_warehouses WHERE tenant_id = $1`,
    [tenantId]
  );
  const m = new Map<string, string>();
  for (const row of r.rows) m.set(row.id, row.code);
  return m;
}

async function resolveDestWarehouseForSource(
  client: PoolClient,
  destTenantId: string,
  sourceWarehouseId: string,
  sourceWhCodeById: Map<string, string>,
  destWhByCode: Map<string, string>,
  defaultDestWhId: string,
  dryRun: boolean
): Promise<string> {
  const code = sourceWhCodeById.get(sourceWarehouseId) ?? 'MAIN';
  const existing = destWhByCode.get(code);
  if (existing) return existing;

  await setTenantContext(client, destTenantId);
  const found = await client.query<{ id: string }>(
    `SELECT id FROM shop_warehouses WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [destTenantId, code]
  );
  if (found.rows.length > 0) {
    destWhByCode.set(code, found.rows[0].id);
    return found.rows[0].id;
  }

  if (dryRun) {
    const placeholder = `__dry_wh_${code}__`;
    destWhByCode.set(code, placeholder);
    return placeholder;
  }

  const ins = await client.query<{ id: string }>(
    `INSERT INTO shop_warehouses (tenant_id, name, code, is_active)
     VALUES ($1, $2, $3, TRUE) RETURNING id`,
    [destTenantId, `Warehouse ${code}`, code]
  );
  const id = ins.rows[0].id;
  destWhByCode.set(code, id);
  return id;
}

async function fetchSkuProductMap(
  client: PoolClient,
  tenantId: string
): Promise<Map<string, { id: string; sku: string; name: string }>> {
  await setTenantContext(client, tenantId);
  const r = await client.query<{ id: string; sku: string; name: string }>(
    `SELECT id, sku, name FROM shop_products WHERE tenant_id = $1`,
    [tenantId]
  );
  const m = new Map<string, { id: string; sku: string; name: string }>();
  for (const row of r.rows) {
    const key = row.sku.trim().toLowerCase();
    if (!key) continue;
    m.set(key, row);
  }
  return m;
}

async function copyInventoryForProduct(
  client: PoolClient,
  opts: {
    sourceTenantId: string;
    destTenantId: string;
    sourceProductId: string;
    destProductId: string;
    sourceWhCodeById: Map<string, string>;
    destWhByCode: Map<string, string>;
    defaultDestWhId: string;
    dryRun: boolean;
    withBatches: boolean;
    replaceBatches: boolean;
  }
): Promise<{ inventoryRows: number; batchesCopied: number; batchesReplaced: number }> {
  const {
    sourceTenantId,
    destTenantId,
    sourceProductId,
    destProductId,
    sourceWhCodeById,
    destWhByCode,
    defaultDestWhId,
    dryRun,
    withBatches,
    replaceBatches,
  } = opts;

  let inventoryRows = 0;
  let batchesCopied = 0;
  let batchesReplaced = 0;

  await setTenantContext(client, sourceTenantId);
  const invRows = await client.query<{
    warehouse_id: string;
    quantity_on_hand: string;
    quantity_reserved: string;
  }>(
    `SELECT warehouse_id, quantity_on_hand, quantity_reserved
     FROM shop_inventory WHERE tenant_id = $1 AND product_id = $2`,
    [sourceTenantId, sourceProductId]
  );

  if (invRows.rows.length === 0) {
    return { inventoryRows: 0, batchesCopied: 0, batchesReplaced: 0 };
  }

  for (const inv of invRows.rows) {
    const destWhId = await resolveDestWarehouseForSource(
      client,
      destTenantId,
      inv.warehouse_id,
      sourceWhCodeById,
      destWhByCode,
      defaultDestWhId,
      dryRun
    );
    if (dryRun && destWhId.startsWith('__dry_')) {
      inventoryRows++;
      continue;
    }
    await setTenantContext(client, destTenantId);
    await client.query(
      `INSERT INTO shop_inventory (tenant_id, product_id, warehouse_id, quantity_on_hand, quantity_reserved)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, product_id, warehouse_id)
       DO UPDATE SET
         quantity_on_hand = EXCLUDED.quantity_on_hand,
         quantity_reserved = EXCLUDED.quantity_reserved,
         updated_at = NOW()`,
      [destTenantId, destProductId, destWhId, inv.quantity_on_hand, inv.quantity_reserved]
    );
    inventoryRows++;
  }

  if (!withBatches) {
    return { inventoryRows, batchesCopied, batchesReplaced };
  }

  if (replaceBatches && !dryRun) {
    await setTenantContext(client, destTenantId);
    const del = await client.query(
      `DELETE FROM inventory_batches WHERE tenant_id = $1 AND product_id = $2`,
      [destTenantId, destProductId]
    );
    batchesReplaced = del.rowCount ?? 0;
  }

  await setTenantContext(client, sourceTenantId);
  const batches = await client.query<{
    warehouse_id: string;
    batch_no: string;
    expiry_date: string | null;
    quantity_received: string;
    quantity_remaining: string;
    cost_price: string;
  }>(
    `SELECT warehouse_id, batch_no, expiry_date, quantity_received, quantity_remaining, cost_price
     FROM inventory_batches WHERE tenant_id = $1 AND product_id = $2`,
    [sourceTenantId, sourceProductId]
  );

  for (const b of batches.rows) {
    const destWhId = await resolveDestWarehouseForSource(
      client,
      destTenantId,
      b.warehouse_id,
      sourceWhCodeById,
      destWhByCode,
      defaultDestWhId,
      dryRun
    );
    if (dryRun) {
      batchesCopied++;
      continue;
    }

    await setTenantContext(client, destTenantId);
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM inventory_batches
       WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
         AND batch_no = $4
         AND (expiry_date IS NOT DISTINCT FROM $5::date)
       LIMIT 1`,
      [destTenantId, destProductId, destWhId, b.batch_no, b.expiry_date]
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE inventory_batches SET
           quantity_received = $2,
           quantity_remaining = $3,
           cost_price = $4,
           updated_at = NOW()
         WHERE id = $1`,
        [
          existing.rows[0].id,
          b.quantity_received,
          b.quantity_remaining,
          b.cost_price,
        ]
      );
    } else {
      const batchId = generateId('batch');
      await client.query(
        `INSERT INTO inventory_batches (
          id, tenant_id, product_id, warehouse_id, batch_no, expiry_date,
          quantity_received, quantity_remaining, cost_price, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          batchId,
          destTenantId,
          destProductId,
          destWhId,
          b.batch_no,
          b.expiry_date,
          b.quantity_received,
          b.quantity_remaining,
          b.cost_price,
        ]
      );
    }
    batchesCopied++;
  }

  return { inventoryRows, batchesCopied, batchesReplaced };
}

async function migrateInventory(
  client: PoolClient,
  fromTenantId: string,
  toTenantId: string,
  dryRun: boolean,
  withBatches: boolean,
  replaceBatches: boolean,
  skuFilter: string | undefined,
  verbose: boolean
): Promise<MigrateStats> {
  const stats: MigrateStats = {
    sourceProducts: 0,
    matched: 0,
    updated: 0,
    skippedNoDestSku: 0,
    skippedNoSourceStock: 0,
    inventoryRowsUpserted: 0,
    batchesCopied: 0,
    batchesReplaced: 0,
    errors: 0,
  };

  const sourceProducts = await fetchSkuProductMap(client, fromTenantId);
  const destBySku = await fetchSkuProductMap(client, toTenantId);

  const sourceWhCodeById = await loadWarehouseCodeById(client, fromTenantId);
  const destWhByCode = new Map<string, string>();
  await setTenantContext(client, toTenantId);
  const destWhRows = await client.query<{ id: string; code: string }>(
    `SELECT id, code FROM shop_warehouses WHERE tenant_id = $1`,
    [toTenantId]
  );
  for (const w of destWhRows.rows) destWhByCode.set(w.code, w.id);

  const defaultDestWhId = dryRun
    ? '__dry_default_wh__'
    : await ensureDestWarehouse(client, toTenantId);

  let entries = Array.from(sourceProducts.entries());
  if (skuFilter?.trim()) {
    const key = skuFilter.trim().toLowerCase();
    const one = sourceProducts.get(key);
    entries = one ? [[key, one]] : [];
    if (entries.length === 0) {
      console.warn(`No source product with SKU "${skuFilter}" on source tenant.`);
    }
  }

  stats.sourceProducts = entries.length;
  console.log(`\nSource products to process: ${entries.length}`);
  console.log(`Destination catalog SKUs: ${destBySku.size}`);
  console.log(`Source warehouses: ${sourceWhCodeById.size}, dest warehouses: ${destWhByCode.size}`);

  for (const [skuKey, src] of entries) {
    const dest = destBySku.get(skuKey);
    if (!dest) {
      stats.skippedNoDestSku++;
      if (verbose) {
        console.log(`  [skip] ${src.sku} — not on destination tenant`);
      }
      continue;
    }

    stats.matched++;

    try {
      const result = await copyInventoryForProduct(client, {
        sourceTenantId: fromTenantId,
        destTenantId: toTenantId,
        sourceProductId: src.id,
        destProductId: dest.id,
        sourceWhCodeById,
        destWhByCode,
        defaultDestWhId,
        dryRun,
        withBatches,
        replaceBatches,
      });

      if (result.inventoryRows === 0) {
        stats.skippedNoSourceStock++;
        if (verbose) console.log(`  [skip] ${src.sku} — no source inventory rows`);
        continue;
      }

      stats.updated++;
      stats.inventoryRowsUpserted += result.inventoryRows;
      stats.batchesCopied += result.batchesCopied;
      stats.batchesReplaced += result.batchesReplaced;

      if (verbose) {
        console.log(
          `  [ok] ${src.sku} (${src.name}) → ${dest.name}: ` +
            `${result.inventoryRows} warehouse row(s), ${result.batchesCopied} batch(es)`
        );
      }
    } catch (err: unknown) {
      stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [error] ${src.sku}: ${msg}`);
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

  console.log('=== Inventory migration (SKU-matched stock copy) ===');
  console.log('Source:', fromTenant);
  console.log('Destination:', toTenant);
  console.log(`Mode: ${dryRun ? 'DRY RUN (pass --execute to apply)' : 'EXECUTE'}`);
  console.log(
    `Options: withBatches=${args.withBatches}, replaceBatches=${args.replaceBatches}` +
      (args.skuFilter ? `, skuFilter=${args.skuFilter}` : '')
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stats = await migrateInventory(
      client,
      fromTenant.id,
      toTenant.id,
      dryRun,
      args.withBatches,
      args.replaceBatches,
      args.skuFilter,
      args.verbose
    );

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\nDRY RUN complete — no changes written. Re-run with --execute to apply.');
    } else {
      await client.query('COMMIT');
      console.log('\nMigration committed.');
    }

    console.log('\nSummary:');
    console.log(JSON.stringify(stats, null, 2));

    if (stats.skippedNoDestSku > 0) {
      console.log(
        `\nNote: ${stats.skippedNoDestSku} source SKU(s) have no matching product on destination.` +
          ' Run migrate-skus-between-tenants.ts first, or create those products on obostores.'
      );
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
