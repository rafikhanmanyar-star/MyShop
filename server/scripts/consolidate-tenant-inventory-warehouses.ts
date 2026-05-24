/**
 * Merge all tenant inventory into one warehouse (default: branch-linked Main Store).
 *
 * Use when stock was migrated into secondary warehouses (e.g. BR-8714) while POS/mobile
 * expect quantities on the branch warehouse (branch id = shop_warehouses.id).
 *
 * Moves per product:
 *   - shop_inventory.quantity_on_hand + quantity_reserved
 *   - inventory_batches rows (updates warehouse_id)
 *   - open mobile Reserve movements (Pending … OutForDelivery) to the target warehouse
 *
 * Usage (from server/):
 *   npx tsx scripts/consolidate-tenant-inventory-warehouses.ts --list-tenants
 *   npx tsx scripts/consolidate-tenant-inventory-warehouses.ts
 *   npx tsx scripts/consolidate-tenant-inventory-warehouses.ts --execute
 *   npx tsx scripts/consolidate-tenant-inventory-warehouses.ts --execute --tenant obostores
 *   npx tsx scripts/consolidate-tenant-inventory-warehouses.ts --target-warehouse-id <uuid> --execute
 *
 * Env:
 *   DATABASE_URL — required
 *   TENANT_HINT — default "obostores"
 *   DRY_RUN=1 — report only (default unless --execute)
 *   VERBOSE=1 — log each SKU moved
 *   PROGRESS_EVERY=25 — progress line interval (default 25 SKUs)
 */

import dotenv from 'dotenv';
import type { Pool, PoolClient } from 'pg';
import { getDatabaseService } from '../services/databaseService.js';
import { invalidateInventorySkuListCache } from '../services/shopService.js';

dotenv.config();

type TenantRow = { id: string; name: string; company_name: string | null; slug: string | null };
type WarehouseRow = { id: string; name: string; code: string | null };
type InvRow = {
  product_id: string;
  sku: string;
  name: string;
  quantity_on_hand: string;
  quantity_reserved: string;
  batch_remaining: string;
};

type Stats = {
  sourceWarehouses: number;
  productsMoved: number;
  onHandMoved: number;
  reservedMoved: number;
  batchesMoved: number;
  reserveMovementsUpdated: number;
  transferMovements: number;
  skippedAlreadyAtTarget: number;
};

const OPEN_MOBILE_STATUSES = ['Pending', 'Confirmed', 'Packed', 'OutForDelivery'];

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mRem = m % 60;
  return mRem > 0 ? `${h}h ${mRem}m` : `${h}h`;
}

/** Periodic progress lines (respects TTY for in-place updates). */
class ProgressReporter {
  private readonly start = Date.now();
  private lastPrintedAt = 0;

  constructor(
    private readonly label: string,
    private readonly total: number,
    private readonly every: number,
    private readonly enabled: boolean,
    private readonly verbose: boolean
  ) {}

  begin(extra?: string) {
    if (!this.enabled) return;
    const suffix = extra ? ` — ${extra}` : '';
    console.log(`\n▶ ${this.label}: 0/${this.total} (0%)${suffix}`);
  }

  tick(done: number, detail?: { sku?: string; onHand?: number; reserved?: number }) {
    if (!this.enabled) return;
    if (this.verbose && detail?.sku) {
      const parts = [`${detail.sku}`];
      if (detail.onHand != null && detail.onHand !== 0) parts.push(`on_hand=${detail.onHand}`);
      if (detail.reserved != null && detail.reserved !== 0) parts.push(`reserved=${detail.reserved}`);
      console.log(`  · ${parts.join(' ')}`);
      return;
    }

    const isLast = done >= this.total;
    const atInterval = done === 1 || done % this.every === 0;
    const now = Date.now();
    const timeForHeartbeat = now - this.lastPrintedAt >= 5000;
    if (!isLast && !atInterval && !timeForHeartbeat) return;

    this.lastPrintedAt = now;
    const pct = this.total > 0 ? Math.round((done / this.total) * 100) : 100;
    const elapsed = now - this.start;
    const rate = done > 0 ? elapsed / done : 0;
    const remaining = Math.max(0, this.total - done);
    const eta = done > 0 && remaining > 0 ? rate * remaining : 0;

    let line = `[${done}/${this.total}] ${pct}% — ${this.label}`;
    line += ` — elapsed ${fmtDuration(elapsed)}`;
    if (!isLast && eta > 0) line += `, ~${fmtDuration(eta)} left`;
    if (detail?.sku) line += ` — ${detail.sku}`;

    if (process.stdout.isTTY && !this.verbose) {
      process.stdout.write(`\r${line.padEnd(Math.max(line.length, 72))}`);
      if (isLast) process.stdout.write('\n');
    } else {
      console.log(line);
    }
  }

  done(message?: string) {
    if (!this.enabled) return;
    const elapsed = fmtDuration(Date.now() - this.start);
    console.log(`✓ ${this.label} complete (${this.total}/${this.total}) in ${elapsed}${message ? ` — ${message}` : ''}`);
  }
}

function countActionableProducts(products: InvRow[]): number {
  let n = 0;
  for (const row of products) {
    const onHand = parseFloat(row.quantity_on_hand) || 0;
    const reserved = parseFloat(row.quantity_reserved) || 0;
    const batchRem = parseFloat(row.batch_remaining) || 0;
    if (onHand !== 0 || reserved !== 0 || batchRem > 0) n++;
  }
  return n;
}

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
  let tenantHint = process.env.TENANT_HINT?.trim() || 'obostores';
  let tenantId: string | undefined;
  let targetWarehouseId: string | undefined;
  let listTenants = false;
  let execute = false;
  let verbose = false;
  let noProgress = false;
  let progressEvery = parseInt(process.env.PROGRESS_EVERY ?? '25', 10);
  const sourceWarehouseIds: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list-tenants') listTenants = true;
    else if (arg === '--execute') execute = true;
    else if (arg === '--verbose') verbose = true;
    else if (arg === '--no-progress') noProgress = true;
    else if (arg === '--progress-every') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n > 0) progressEvery = n;
      i = nextI;
    } else if (arg.startsWith('--progress-every=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--progress-every='.length));
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n > 0) progressEvery = n;
      i = nextI;
    } else if (arg === '--tenant') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) tenantHint = value;
      i = nextI;
    } else if (arg.startsWith('--tenant=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--tenant='.length));
      if (value) tenantHint = value;
      i = nextI;
    } else if (arg === '--tenant-id') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) tenantId = value;
      i = nextI;
    } else if (arg.startsWith('--tenant-id=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--tenant-id='.length));
      if (value) tenantId = value;
      i = nextI;
    } else if (arg === '--target-warehouse-id') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) targetWarehouseId = value;
      i = nextI;
    } else if (arg.startsWith('--target-warehouse-id=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--target-warehouse-id='.length));
      if (value) targetWarehouseId = value;
      i = nextI;
    } else if (arg === '--source-warehouse-id') {
      const { value, nextI } = takeOptionalValue(argv, i, '');
      if (value) sourceWarehouseIds.push(value);
      i = nextI;
    } else if (arg.startsWith('--source-warehouse-id=')) {
      const { value, nextI } = takeOptionalValue(argv, i, arg.slice('--source-warehouse-id='.length));
      if (value) sourceWarehouseIds.push(value);
      i = nextI;
    }
  }

  if (process.env.VERBOSE === '1') verbose = true;
  const dryRun = !execute && process.env.DRY_RUN !== '0';

  return {
    tenantHint,
    tenantId,
    targetWarehouseId,
    sourceWarehouseIds,
    listTenants,
    dryRun,
    verbose,
    noProgress,
    progressEvery,
  };
}

async function setTenantContext(client: PoolClient, tenantId: string) {
  await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
}

async function resolveTenant(pool: Pool, hint: string, id?: string): Promise<TenantRow> {
  if (id?.trim()) {
    const r = await pool.query<TenantRow>(
      `SELECT id, name, company_name, slug FROM tenants WHERE id = $1`,
      [id.trim()]
    );
    if (r.rows.length === 0) throw new Error(`No tenant with id ${id}`);
    return r.rows[0];
  }

  const h = hint.trim();
  let r = await pool.query<TenantRow>(
    `SELECT id, name, company_name, slug FROM tenants
     WHERE LOWER(TRIM(slug)) = LOWER(TRIM($1))
        OR LOWER(TRIM(company_name)) = LOWER(TRIM($1))
        OR LOWER(TRIM(name)) = LOWER(TRIM($1))
     ORDER BY created_at ASC`,
    [h]
  );
  if (r.rows.length === 0) {
    r = await pool.query<TenantRow>(
      `SELECT id, name, company_name, slug FROM tenants
       WHERE slug ILIKE $1 OR company_name ILIKE $1 OR name ILIKE $1
       ORDER BY created_at ASC`,
      [`%${h}%`]
    );
  }
  if (r.rows.length === 0) throw new Error(`No tenant matching "${hint}"`);
  if (r.rows.length > 1) {
    const lines = r.rows
      .map((t) => `  ${t.id}  slug=${t.slug ?? ''}  company=${t.company_name ?? ''}`)
      .join('\n');
    throw new Error(`Multiple tenants match "${hint}". Use --tenant-id:\n${lines}`);
  }
  return r.rows[0];
}

async function resolveTargetWarehouse(
  client: PoolClient,
  tenantId: string,
  explicitId?: string
): Promise<{ warehouse: WarehouseRow; branchName: string | null }> {
  if (explicitId?.trim()) {
    const r = await client.query<WarehouseRow>(
      `SELECT id, name, code FROM shop_warehouses WHERE tenant_id = $1 AND id = $2`,
      [tenantId, explicitId.trim()]
    );
    if (r.rows.length === 0) throw new Error(`Target warehouse not found: ${explicitId}`);
    const branch = await client.query<{ name: string }>(
      `SELECT name FROM shop_branches WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, explicitId.trim()]
    );
    return { warehouse: r.rows[0], branchName: branch.rows[0]?.name ?? null };
  }

  const branchWh = await client.query<WarehouseRow & { branch_name: string }>(
    `SELECT w.id, w.name, w.code, b.name AS branch_name
     FROM shop_branches b
     JOIN shop_warehouses w ON w.id = b.id AND w.tenant_id = b.tenant_id
     WHERE b.tenant_id = $1 AND COALESCE(b.is_active, TRUE) = TRUE
     ORDER BY b.name ASC
     LIMIT 1`,
    [tenantId]
  );
  if (branchWh.rows.length > 0) {
    const row = branchWh.rows[0];
    return {
      warehouse: { id: row.id, name: row.name, code: row.code },
      branchName: row.branch_name,
    };
  }

  const wh = await client.query<WarehouseRow>(
    `SELECT id, name, code FROM shop_warehouses WHERE tenant_id = $1 ORDER BY name ASC LIMIT 1`,
    [tenantId]
  );
  if (wh.rows.length === 0) throw new Error('Tenant has no warehouses');
  return { warehouse: wh.rows[0], branchName: null };
}

async function listSourceWarehouses(
  client: PoolClient,
  tenantId: string,
  targetWarehouseId: string,
  explicitSourceIds: string[]
): Promise<WarehouseRow[]> {
  if (explicitSourceIds.length > 0) {
    const r = await client.query<WarehouseRow>(
      `SELECT id, name, code FROM shop_warehouses
       WHERE tenant_id = $1 AND id = ANY($2::text[]) AND id <> $3
       ORDER BY name ASC`,
      [tenantId, explicitSourceIds, targetWarehouseId]
    );
    return r.rows;
  }

  const r = await client.query<WarehouseRow>(
    `SELECT w.id, w.name, w.code
     FROM shop_warehouses w
     WHERE w.tenant_id = $1
       AND w.id <> $2
       AND (
         EXISTS (
           SELECT 1 FROM shop_inventory i
           WHERE i.tenant_id = w.tenant_id AND i.warehouse_id = w.id
             AND (COALESCE(i.quantity_on_hand, 0) <> 0 OR COALESCE(i.quantity_reserved, 0) <> 0)
         )
         OR EXISTS (
           SELECT 1 FROM inventory_batches b
           WHERE b.tenant_id = w.tenant_id AND b.warehouse_id = w.id
             AND COALESCE(b.quantity_remaining, 0) > 0
         )
       )
     ORDER BY w.name ASC`,
    [tenantId, targetWarehouseId]
  );
  return r.rows;
}

async function fetchProductsToMove(
  client: PoolClient,
  tenantId: string,
  sourceWarehouseId: string
): Promise<InvRow[]> {
  const r = await client.query<InvRow>(
    `SELECT p.id AS product_id, p.sku, p.name,
            COALESCE(i.quantity_on_hand, 0)::text AS quantity_on_hand,
            COALESCE(i.quantity_reserved, 0)::text AS quantity_reserved,
            COALESCE((
              SELECT SUM(b.quantity_remaining)
              FROM inventory_batches b
              WHERE b.tenant_id = $1 AND b.product_id = p.id AND b.warehouse_id = $2
                AND COALESCE(b.quantity_remaining, 0) > 0
            ), 0)::text AS batch_remaining
     FROM shop_products p
     LEFT JOIN shop_inventory i
       ON i.tenant_id = p.tenant_id AND i.product_id = p.id AND i.warehouse_id = $2
     WHERE p.tenant_id = $1
       AND (
         COALESCE(i.quantity_on_hand, 0) <> 0
         OR COALESCE(i.quantity_reserved, 0) <> 0
         OR EXISTS (
           SELECT 1 FROM inventory_batches b
           WHERE b.tenant_id = $1 AND b.product_id = p.id AND b.warehouse_id = $2
             AND COALESCE(b.quantity_remaining, 0) > 0
         )
       )
     ORDER BY p.sku ASC`,
    [tenantId, sourceWarehouseId]
  );
  return r.rows;
}

async function countOpenReserveMovements(
  client: PoolClient,
  tenantId: string,
  sourceWarehouseId: string
): Promise<number> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM shop_inventory_movements m
     JOIN mobile_orders o ON o.id = m.reference_id AND o.tenant_id = m.tenant_id
     WHERE m.tenant_id = $1
       AND m.warehouse_id = $2
       AND m.type = 'Reserve'
       AND o.status = ANY($3::text[])`,
    [tenantId, sourceWarehouseId, OPEN_MOBILE_STATUSES]
  );
  return parseInt(r.rows[0]?.c ?? '0', 10) || 0;
}

async function consolidateWarehouse(
  client: PoolClient,
  tenantId: string,
  targetWarehouseId: string,
  sourceWarehouseId: string,
  sourceWarehouseName: string,
  transferRef: string,
  dryRun: boolean,
  progressOpts: { enabled: boolean; verbose: boolean; every: number }
): Promise<Stats> {
  const stats: Stats = {
    sourceWarehouses: 1,
    productsMoved: 0,
    onHandMoved: 0,
    reservedMoved: 0,
    batchesMoved: 0,
    reserveMovementsUpdated: 0,
    transferMovements: 0,
    skippedAlreadyAtTarget: 0,
  };

  if (sourceWarehouseId === targetWarehouseId) return stats;

  if (progressOpts.enabled) {
    console.log(`\n▶ Loading SKUs from ${sourceWarehouseName}…`);
  }

  const products = await fetchProductsToMove(client, tenantId, sourceWarehouseId);
  const openReserves = await countOpenReserveMovements(client, tenantId, sourceWarehouseId);
  const actionableTotal = countActionableProducts(products);

  if (products.length === 0 && openReserves === 0) return stats;

  const progress = new ProgressReporter(
    dryRun ? `scan ${sourceWarehouseName}` : `move ${sourceWarehouseName}`,
    actionableTotal,
    progressOpts.every,
    progressOpts.enabled,
    progressOpts.verbose
  );

  progress.begin(dryRun ? 'dry run' : `${actionableTotal} SKU(s)`);

  let done = 0;

  if (dryRun) {
    for (const row of products) {
      const onHand = parseFloat(row.quantity_on_hand) || 0;
      const reserved = parseFloat(row.quantity_reserved) || 0;
      const batchRem = parseFloat(row.batch_remaining) || 0;
      if (onHand === 0 && reserved === 0 && batchRem <= 0) continue;
      stats.productsMoved++;
      stats.onHandMoved += onHand;
      stats.reservedMoved += reserved;
      if (batchRem > 0) stats.batchesMoved++;
      done++;
      progress.tick(done, { sku: row.sku, onHand, reserved });
    }
    stats.reserveMovementsUpdated = openReserves;
    stats.transferMovements = stats.productsMoved * 2;
    progress.done(
      dryRun
        ? `${stats.productsMoved} SKUs, ${Math.round(stats.onHandMoved)} units`
        : undefined
    );
    return stats;
  }

  for (const row of products) {
    const onHand = parseFloat(row.quantity_on_hand) || 0;
    const reserved = parseFloat(row.quantity_reserved) || 0;
    const batchRem = parseFloat(row.batch_remaining) || 0;
    if (onHand === 0 && reserved === 0 && batchRem <= 0) continue;

    const batchUpd = await client.query(
      `UPDATE inventory_batches
       SET warehouse_id = $1, updated_at = NOW()
       WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4
       RETURNING id`,
      [targetWarehouseId, tenantId, row.product_id, sourceWarehouseId]
    );
    stats.batchesMoved += batchUpd.rowCount ?? batchUpd.length ?? 0;

    await client.query(
      `INSERT INTO shop_inventory (tenant_id, product_id, warehouse_id, quantity_on_hand, quantity_reserved, updated_at)
       VALUES ($1, $2, $3, 0, 0, NOW())
       ON CONFLICT (tenant_id, product_id, warehouse_id) DO NOTHING`,
      [tenantId, row.product_id, targetWarehouseId]
    );

    if (onHand !== 0 || reserved !== 0) {
      await client.query(
        `UPDATE shop_inventory
         SET quantity_on_hand = quantity_on_hand + $1,
             quantity_reserved = quantity_reserved + $2,
             updated_at = NOW()
         WHERE tenant_id = $3 AND product_id = $4 AND warehouse_id = $5`,
        [onHand, reserved, tenantId, row.product_id, targetWarehouseId]
      );

      await client.query(
        `UPDATE shop_inventory
         SET quantity_on_hand = 0, quantity_reserved = 0, updated_at = NOW()
         WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3`,
        [tenantId, row.product_id, sourceWarehouseId]
      );
    }

    if (onHand !== 0) {
      const outId = generateId('im');
      const inId = generateId('im');
      await client.query(
        `INSERT INTO shop_inventory_movements
           (id, tenant_id, product_id, warehouse_id, type, quantity, reference_id, reason)
         VALUES ($1, $2, $3, $4, 'Transfer', $5, $6, $7)`,
        [
          outId,
          tenantId,
          row.product_id,
          sourceWarehouseId,
          -onHand,
          transferRef,
          `Consolidated to branch warehouse (${targetWarehouseId})`,
        ]
      );
      await client.query(
        `INSERT INTO shop_inventory_movements
           (id, tenant_id, product_id, warehouse_id, type, quantity, reference_id, reason)
         VALUES ($1, $2, $3, $4, 'Transfer', $5, $6, $7)`,
        [
          inId,
          tenantId,
          row.product_id,
          targetWarehouseId,
          onHand,
          transferRef,
          `Consolidated from warehouse (${sourceWarehouseId})`,
        ]
      );
      stats.transferMovements += 2;
    }

    stats.productsMoved++;
    stats.onHandMoved += onHand;
    stats.reservedMoved += reserved;
    done++;
    progress.tick(done, { sku: row.sku, onHand, reserved });
  }

  if (openReserves > 0) {
    console.log(`\n▶ Retargeting ${openReserves} open mobile Reserve movement(s)…`);
  }
  const reserveUpd = await client.query(
    `UPDATE shop_inventory_movements m
     SET warehouse_id = $1
     FROM mobile_orders o
     WHERE m.reference_id = o.id
       AND m.tenant_id = o.tenant_id
       AND m.tenant_id = $2
       AND m.warehouse_id = $3
       AND m.type = 'Reserve'
       AND o.status = ANY($4::text[])`,
    [targetWarehouseId, tenantId, sourceWarehouseId, OPEN_MOBILE_STATUSES]
  );
  stats.reserveMovementsUpdated = reserveUpd.rowCount ?? reserveUpd.length ?? 0;

  progress.done(
    `${stats.productsMoved} SKUs, ${Math.round(stats.onHandMoved)} units, ${stats.batchesMoved} batch rows`
  );

  return stats;
}

function addStats(total: Stats, part: Stats) {
  total.sourceWarehouses += part.sourceWarehouses;
  total.productsMoved += part.productsMoved;
  total.onHandMoved += part.onHandMoved;
  total.reservedMoved += part.reservedMoved;
  total.batchesMoved += part.batchesMoved;
  total.reserveMovementsUpdated += part.reserveMovementsUpdated;
  total.transferMovements += part.transferMovements;
  total.skippedAlreadyAtTarget += part.skippedAlreadyAtTarget;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDatabaseService();
  const pool = db.getPool();
  if (!pool) throw new Error('DATABASE_URL is required (PostgreSQL pool unavailable)');

  if (args.listTenants) {
    const rows = await pool.query<TenantRow>(
      `SELECT id, name, company_name, slug FROM tenants ORDER BY company_name, name`
    );
    for (const t of rows.rows) {
      console.log(`${t.id}  slug=${t.slug ?? ''}  company=${t.company_name ?? t.name}`);
    }
    return;
  }

  const tenant = await resolveTenant(pool, args.tenantHint, args.tenantId);
  console.log(`Tenant: ${tenant.company_name ?? tenant.name} (${tenant.id})`);
  console.log(`Mode: ${args.dryRun ? 'DRY RUN (pass --execute to apply)' : 'EXECUTE'}`);

  const transferRef = `consolidate-${tenant.slug ?? tenant.id}-${Date.now()}`;
  const total: Stats = {
    sourceWarehouses: 0,
    productsMoved: 0,
    onHandMoved: 0,
    reservedMoved: 0,
    batchesMoved: 0,
    reserveMovementsUpdated: 0,
    transferMovements: 0,
    skippedAlreadyAtTarget: 0,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenant.id);

    const { warehouse: targetWh, branchName } = await resolveTargetWarehouse(
      client,
      tenant.id,
      args.targetWarehouseId
    );
    console.log(
      `Target warehouse: ${targetWh.name} (${targetWh.id})${branchName ? ` — branch "${branchName}"` : ''}`
    );

    const sources = await listSourceWarehouses(
      client,
      tenant.id,
      targetWh.id,
      args.sourceWarehouseIds
    );
    if (sources.length === 0) {
      console.log('No source warehouses with stock to consolidate.');
      await client.query('ROLLBACK');
      return;
    }

    console.log('Source warehouses:');
    for (const s of sources) {
      const sum = await client.query<{ on_hand: string; reserved: string; skus: string }>(
        `SELECT COALESCE(SUM(quantity_on_hand), 0)::text AS on_hand,
                COALESCE(SUM(quantity_reserved), 0)::text AS reserved,
                COUNT(*)::text AS skus
         FROM shop_inventory WHERE tenant_id = $1 AND warehouse_id = $2`,
        [tenant.id, s.id]
      );
      console.log(
        `  - ${s.name} (${s.id}) code=${s.code ?? ''} rows=${sum.rows[0]?.skus ?? 0} on_hand=${sum.rows[0]?.on_hand ?? 0} reserved=${sum.rows[0]?.reserved ?? 0}`
      );
    }

    for (let si = 0; si < sources.length; si++) {
      const source = sources[si];
      if (sources.length > 1) {
        console.log(`\n━━━ Source ${si + 1}/${sources.length}: ${source.name} (${source.id}) ━━━`);
      }

      const part = await consolidateWarehouse(
        client,
        tenant.id,
        targetWh.id,
        source.id,
        source.name,
        transferRef,
        args.dryRun,
        {
          enabled: !args.noProgress,
          verbose: args.verbose,
          every: args.progressEvery,
        }
      );
      addStats(total, part);
    }

    if (args.dryRun) {
      console.log('\n▶ Rolling back (dry run)…');
      await client.query('ROLLBACK');
    } else {
      console.log('\n▶ Committing transaction…');
      await client.query('COMMIT');
      invalidateInventorySkuListCache(tenant.id);
      console.log('✓ Committed');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  console.log('\nSummary:');
  console.log(`  source warehouses processed: ${total.sourceWarehouses}`);
  console.log(`  products moved: ${total.productsMoved}`);
  console.log(`  on_hand moved: ${Math.round(total.onHandMoved * 100) / 100}`);
  console.log(`  reserved moved: ${Math.round(total.reservedMoved * 100) / 100}`);
  console.log(`  batch rows moved: ${total.batchesMoved}`);
  console.log(`  open Reserve movements retargeted: ${total.reserveMovementsUpdated}`);
  console.log(`  Transfer movement rows: ${total.transferMovements}`);
  if (args.dryRun) {
    console.log('\nDry run complete — no changes written. Re-run with --execute to apply.');
  } else {
    console.log(`\nDone. Reference id prefix: ${transferRef}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
