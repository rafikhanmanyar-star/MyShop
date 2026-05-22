/**
 * Migrate product catalog from one tenant/company to another.
 *
 * Order (required for FK integrity):
 *   1. Categories (parents before children)
 *   2. Brands
 *   3. SKUs (shop_products) — category_id / subcategory_id / brand_id use mapped dest IDs
 *
 * Usage (from server/):
 *   npx tsx scripts/migrate-skus-between-tenants.ts --list-tenants
 *   npx tsx scripts/migrate-skus-between-tenants.ts
 *   npx tsx scripts/migrate-skus-between-tenants.ts --execute
 *   npx tsx scripts/migrate-skus-between-tenants.ts --with-inventory --execute
 *
 * Env:
 *   DATABASE_URL — required
 *   FROM_COMPANY_HINT — default "oBo"
 *   TO_COMPANY_HINT — default "obostores"
 *   DRY_RUN=1 — report only (default unless --execute)
 *   VERBOSE=1 — log each row
 */

import dotenv from 'dotenv';
import type { Pool, PoolClient } from 'pg';
import { getDatabaseService } from '../services/databaseService.js';

dotenv.config();

type TenantRow = { id: string; name: string; company_name: string | null };
type ProductRow = Record<string, unknown>;
type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  type: string;
  mobile_icon_url?: string | null;
};

type CategoryStats = { inserted: number; linked: number; updated: number; skipped: number };
type BrandStats = { inserted: number; linked: number };
type SkuStats = { inserted: number; updated: number; skipped: number; errors: number };

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
  let fromCompany = process.env.FROM_COMPANY_HINT?.trim() || 'oBo';
  let toCompany = process.env.TO_COMPANY_HINT?.trim() || 'obostores';
  let fromId: string | undefined;
  let toId: string | undefined;
  let listTenants = false;
  let execute = false;
  let withInventory = false;
  let updateExisting = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list-tenants') listTenants = true;
    else if (arg === '--execute') execute = true;
    else if (arg === '--with-inventory') withInventory = true;
    else if (arg === '--update-existing') updateExisting = true;
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

  return { fromCompany, toCompany, fromId, toId, listTenants, execute, withInventory, updateExisting };
}

async function setTenantContext(client: PoolClient, tenantId: string) {
  await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
}

async function resolveTenantByHint(pool: Pool, hint: string | undefined, id: string | undefined, label: string): Promise<TenantRow> {
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
    const lines = r.rows.map((t) => `  ${t.id}  name=${t.name}  company=${t.company_name ?? ''}`).join('\n');
    throw new Error(`${label}: multiple tenants match "${hint}". Use an exact --${label}-id:\n${lines}`);
  }
  return r.rows[0];
}

function categoryDestKey(parentDestId: string | null, name: string): string {
  return `${(parentDestId ?? 'root').toLowerCase()}::${name.trim().toLowerCase()}`;
}

function buildDestCategoryKeyMap(rows: CategoryRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of rows) {
    m.set(categoryDestKey(c.parent_id, c.name), c.id);
  }
  return m;
}

/** Parents before children so parent_id FKs exist on insert. */
function sortCategoriesParentsFirst(rows: CategoryRow[]): CategoryRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sorted: CategoryRow[] = [];
  const done = new Set<string>();

  const visit = (id: string) => {
    if (done.has(id)) return;
    const c = byId.get(id);
    if (!c) return;
    if (c.parent_id && byId.has(c.parent_id)) visit(c.parent_id);
    if (!done.has(id)) {
      done.add(id);
      sorted.push(c);
    }
  };

  for (const r of rows) visit(r.id);
  return sorted;
}

/** Product categories plus any ancestor rows referenced by parent_id (even if soft-deleted). */
async function loadProductCategories(client: PoolClient, tenantId: string): Promise<CategoryRow[]> {
  await setTenantContext(client, tenantId);
  const r = await client.query<CategoryRow>(
    `SELECT id, name, parent_id, type, mobile_icon_url
     FROM categories
     WHERE tenant_id = $1 AND type = 'product' AND deleted_at IS NULL
     ORDER BY name ASC`,
    [tenantId]
  );
  const byId = new Map<string, CategoryRow>();
  for (const row of r.rows) byId.set(row.id, row);

  let pendingParentIds = [
    ...new Set(
      r.rows
        .map((c) => c.parent_id)
        .filter((pid): pid is string => !!pid && !byId.has(pid))
    ),
  ];

  while (pendingParentIds.length > 0) {
    const parents = await client.query<CategoryRow>(
      `SELECT id, name, parent_id, type, mobile_icon_url
       FROM categories
       WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tenantId, pendingParentIds]
    );
    pendingParentIds = [];
    for (const row of parents.rows) {
      if (!byId.has(row.id)) {
        byId.set(row.id, row);
        if (row.parent_id && !byId.has(row.parent_id)) pendingParentIds.push(row.parent_id);
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Phase 1: migrate every source product category to the destination tenant.
 * Builds sourceCategoryId -> destCategoryId map used by SKU migration.
 */
async function migrateAllCategories(
  client: PoolClient,
  sourceTenantId: string,
  destTenantId: string,
  dryRun: boolean,
  updateExisting: boolean,
  verbose: boolean
): Promise<{ categoryIdMap: Map<string, string>; stats: CategoryStats }> {
  const stats: CategoryStats = { inserted: 0, linked: 0, updated: 0, skipped: 0 };
  const categoryIdMap = new Map<string, string>();

  const sourceRows = await loadProductCategories(client, sourceTenantId);
  const destRows = await loadProductCategories(client, destTenantId);
  const destCatsByKey = buildDestCategoryKeyMap(destRows);
  const ordered = sortCategoriesParentsFirst(sourceRows);

  console.log('\n=== Phase 1: Categories (before SKUs) ===');
  console.log(`Source categories: ${ordered.length}`);
  console.log(`Destination categories already present: ${destRows.length}`);

  for (const src of ordered) {
    let destParentId: string | null = null;
    if (src.parent_id) {
      destParentId = categoryIdMap.get(src.parent_id) ?? null;
      if (!destParentId) {
        throw new Error(
          `Category "${src.name}" (${src.id}): parent ${src.parent_id} is not mapped yet. Check category hierarchy.`
        );
      }
    }

    const key = categoryDestKey(destParentId, src.name);
    const existingDestId = destCatsByKey.get(key);

    if (existingDestId) {
      categoryIdMap.set(src.id, existingDestId);
      if (updateExisting && !dryRun && (src.mobile_icon_url ?? null) !== null) {
        await setTenantContext(client, destTenantId);
        await client.query(
          `UPDATE categories SET mobile_icon_url = $3, updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [existingDestId, destTenantId, src.mobile_icon_url]
        );
        stats.updated++;
        if (verbose) console.log(`  [category update] ${src.name}`);
      } else {
        stats.linked++;
        if (verbose) console.log(`  [category link] ${src.name} → existing ${existingDestId}`);
      }
      continue;
    }

    if (dryRun) {
      stats.inserted++;
      categoryIdMap.set(src.id, `__dry__${src.id}`);
      if (verbose) console.log(`  [category insert] ${src.name}${destParentId ? ` (child)` : ''}`);
      continue;
    }

    const newId = generateId('shop_cat');
    await setTenantContext(client, destTenantId);
    await client.query(
      `INSERT INTO categories (id, tenant_id, name, type, parent_id, mobile_icon_url, created_at, updated_at)
       VALUES ($1, $2, $3, 'product', $4, $5, NOW(), NOW())`,
      [newId, destTenantId, src.name, destParentId, src.mobile_icon_url ?? null]
    );
    categoryIdMap.set(src.id, newId);
    destCatsByKey.set(key, newId);
    stats.inserted++;
    if (verbose) console.log(`  [category insert] ${src.name} → ${newId}`);
  }

  console.log('Category summary:', stats);
  return { categoryIdMap, stats };
}

type BrandRow = { id: string; name: string; logo_url?: string | null; is_active?: boolean };

async function loadBrands(client: PoolClient, tenantId: string): Promise<BrandRow[]> {
  await setTenantContext(client, tenantId);
  const r = await client.query<BrandRow>(
    `SELECT id, name, logo_url, is_active FROM shop_brands WHERE tenant_id = $1 ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

/**
 * Phase 2: migrate brands so SKU brand_id references resolve on the destination.
 */
async function migrateAllBrands(
  client: PoolClient,
  sourceTenantId: string,
  destTenantId: string,
  dryRun: boolean,
  verbose: boolean
): Promise<{ brandIdMap: Map<string, string>; stats: BrandStats }> {
  const stats: BrandStats = { inserted: 0, linked: 0 };
  const brandIdMap = new Map<string, string>();

  const sourceBrands = await loadBrands(client, sourceTenantId);

  console.log('\n=== Phase 2: Brands (before SKUs) ===');
  console.log(`Source brands: ${sourceBrands.length}`);

  for (const src of sourceBrands) {
    const name = src.name.trim();
    if (!name) continue;

    await setTenantContext(client, destTenantId);
    const found = await client.query<{ id: string }>(
      `SELECT id FROM shop_brands WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2::text)) LIMIT 1`,
      [destTenantId, name]
    );

    if (found.rows.length > 0) {
      brandIdMap.set(src.id, found.rows[0].id);
      stats.linked++;
      if (verbose) console.log(`  [brand link] ${name}`);
      continue;
    }

    if (dryRun) {
      brandIdMap.set(src.id, `__dry__${src.id}`);
      stats.inserted++;
      if (verbose) console.log(`  [brand insert] ${name}`);
      continue;
    }

    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO shop_brands (tenant_id, name, logo_url, is_active) VALUES ($1, $2, $3, $4) RETURNING id`,
        [destTenantId, name, src.logo_url ?? null, src.is_active ?? true]
      );
      const newId = ins.rows[0].id;
      brandIdMap.set(src.id, newId);
      stats.inserted++;
      if (verbose) console.log(`  [brand insert] ${name} → ${newId}`);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === '23505') {
        const again = await client.query<{ id: string }>(
          `SELECT id FROM shop_brands WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2::text)) LIMIT 1`,
          [destTenantId, name]
        );
        if (again.rows.length > 0) {
          brandIdMap.set(src.id, again.rows[0].id);
          stats.linked++;
        }
      } else {
        throw e;
      }
    }
  }

  console.log('Brand summary:', stats);
  return { brandIdMap, stats };
}

async function resolveBrandIdForSku(
  client: PoolClient,
  destTenantId: string,
  brandIdMap: Map<string, string>,
  sourceBrandId: string | null | undefined,
  brandText: string | null | undefined,
  dryRun: boolean
): Promise<string | null> {
  if (sourceBrandId) {
    const mapped = brandIdMap.get(sourceBrandId);
    if (mapped && !mapped.startsWith('__dry__')) return mapped;
    if (mapped && dryRun) return null;
  }
  const b = (brandText ?? '').trim();
  if (!b) return null;

  await setTenantContext(client, destTenantId);
  const found = await client.query<{ id: string }>(
    `SELECT id FROM shop_brands WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2::text)) LIMIT 1`,
    [destTenantId, b]
  );
  if (found.rows.length > 0) return found.rows[0].id;
  if (dryRun) return null;

  try {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO shop_brands (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [destTenantId, b]
    );
    return ins.rows[0]?.id ?? null;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === '23505') {
      const again = await client.query<{ id: string }>(
        `SELECT id FROM shop_brands WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2::text)) LIMIT 1`,
        [destTenantId, b]
      );
      return again.rows[0]?.id ?? null;
    }
    throw e;
  }
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

async function loadSourceWarehouseMap(
  client: PoolClient,
  sourceTenantId: string
): Promise<Map<string, string>> {
  await setTenantContext(client, sourceTenantId);
  const r = await client.query<{ id: string; code: string }>(
    `SELECT id, code FROM shop_warehouses WHERE tenant_id = $1`,
    [sourceTenantId]
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
  defaultDestWhId: string
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

  const ins = await client.query<{ id: string }>(
    `INSERT INTO shop_warehouses (tenant_id, name, code, is_active)
     VALUES ($1, $2, $3, TRUE) RETURNING id`,
    [destTenantId, `Warehouse ${code}`, code]
  );
  const id = ins.rows[0].id;
  destWhByCode.set(code, id);
  return id;
}

async function fetchProducts(client: PoolClient, tenantId: string): Promise<ProductRow[]> {
  await setTenantContext(client, tenantId);
  const r = await client.query<ProductRow>(
    `SELECT * FROM shop_products WHERE tenant_id = $1 ORDER BY sku ASC`,
    [tenantId]
  );
  return r.rows;
}

async function fetchExistingSkus(client: PoolClient, tenantId: string): Promise<Map<string, string>> {
  await setTenantContext(client, tenantId);
  const r = await client.query<{ id: string; sku: string }>(
    `SELECT id, sku FROM shop_products WHERE tenant_id = $1`,
    [tenantId]
  );
  const m = new Map<string, string>();
  for (const row of r.rows) m.set(row.sku.trim().toLowerCase(), row.id);
  return m;
}

function resolveMappedCategoryId(
  categoryIdMap: Map<string, string>,
  sourceCatId: string | null | undefined,
  dryRun: boolean
): string | null {
  if (!sourceCatId) return null;
  const destId = categoryIdMap.get(sourceCatId);
  if (!destId) {
    throw new Error(`Category ${sourceCatId} missing from phase-1 map`);
  }
  if (dryRun && destId.startsWith('__dry__')) return null;
  return destId;
}

async function insertProduct(
  client: PoolClient,
  destTenantId: string,
  src: ProductRow,
  categoryId: string | null,
  subcategoryId: string | null,
  brandId: string | null
): Promise<string> {
  const newId = generateId('prod');
  await setTenantContext(client, destTenantId);
  await client.query(
    `INSERT INTO shop_products (
      id, tenant_id, name, sku, barcode, category_id, subcategory_id, unit,
      cost_price, retail_price, tax_rate, reorder_point, image_url, is_active,
      mobile_visible, mobile_price, mobile_description, mobile_sort_order,
      brand, brand_id, weight, weight_unit, size, color, material, origin_country, attributes,
      rating_avg, rating_count, popularity_score, total_sales, discount_percentage,
      is_on_sale, is_pre_order, created_by, average_cost, sales_deactivated
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, COALESCE($27::jsonb, '{}'::jsonb),
      $28, $29, $30, $31, $32, $33, $34, $35, $36, $37
    )`,
    [
      newId,
      destTenantId,
      src.name,
      src.sku,
      src.barcode ?? null,
      categoryId,
      subcategoryId,
      src.unit ?? 'pcs',
      src.cost_price ?? 0,
      src.retail_price ?? 0,
      src.tax_rate ?? 0,
      src.reorder_point ?? 10,
      src.image_url ?? null,
      src.is_active ?? true,
      src.mobile_visible ?? true,
      src.mobile_price ?? null,
      src.mobile_description ?? null,
      src.mobile_sort_order ?? 0,
      src.brand ?? null,
      brandId,
      src.weight ?? null,
      src.weight_unit ?? null,
      src.size ?? null,
      src.color ?? null,
      src.material ?? null,
      src.origin_country ?? null,
      typeof src.attributes === 'string' ? src.attributes : JSON.stringify(src.attributes ?? {}),
      src.rating_avg ?? 0,
      src.rating_count ?? 0,
      src.popularity_score ?? 0,
      src.total_sales ?? 0,
      src.discount_percentage ?? 0,
      src.is_on_sale ?? false,
      src.is_pre_order ?? false,
      src.created_by ?? null,
      src.average_cost ?? 0,
      src.sales_deactivated ?? false,
    ]
  );
  return newId;
}

async function updateProduct(
  client: PoolClient,
  destTenantId: string,
  destProductId: string,
  src: ProductRow,
  categoryId: string | null,
  subcategoryId: string | null,
  brandId: string | null
) {
  await setTenantContext(client, destTenantId);
  await client.query(
    `UPDATE shop_products SET
      name = $3, barcode = $4, category_id = $5, subcategory_id = $6, unit = $7,
      cost_price = $8, retail_price = $9, tax_rate = $10, reorder_point = $11, image_url = $12,
      is_active = $13, mobile_visible = $14, mobile_price = $15, mobile_description = $16,
      mobile_sort_order = $17, brand = $18, brand_id = $19, weight = $20, weight_unit = $21,
      size = $22, color = $23, material = $24, origin_country = $25,
      attributes = COALESCE($26::jsonb, '{}'::jsonb),
      rating_avg = $27, rating_count = $28, popularity_score = $29, total_sales = $30,
      discount_percentage = $31, is_on_sale = $32, is_pre_order = $33, average_cost = $34,
      sales_deactivated = $35, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [
      destProductId,
      destTenantId,
      src.name,
      src.barcode ?? null,
      categoryId,
      subcategoryId,
      src.unit ?? 'pcs',
      src.cost_price ?? 0,
      src.retail_price ?? 0,
      src.tax_rate ?? 0,
      src.reorder_point ?? 10,
      src.image_url ?? null,
      src.is_active ?? true,
      src.mobile_visible ?? true,
      src.mobile_price ?? null,
      src.mobile_description ?? null,
      src.mobile_sort_order ?? 0,
      src.brand ?? null,
      brandId,
      src.weight ?? null,
      src.weight_unit ?? null,
      src.size ?? null,
      src.color ?? null,
      src.material ?? null,
      src.origin_country ?? null,
      typeof src.attributes === 'string' ? src.attributes : JSON.stringify(src.attributes ?? {}),
      src.rating_avg ?? 0,
      src.rating_count ?? 0,
      src.popularity_score ?? 0,
      src.total_sales ?? 0,
      src.discount_percentage ?? 0,
      src.is_on_sale ?? false,
      src.is_pre_order ?? false,
      src.average_cost ?? 0,
      src.sales_deactivated ?? false,
    ]
  );
}

async function copyInventoryForProduct(
  client: PoolClient,
  sourceTenantId: string,
  destTenantId: string,
  sourceProductId: string,
  destProductId: string,
  sourceWhCodeById: Map<string, string>,
  destWhByCode: Map<string, string>,
  defaultDestWhId: string
) {
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

  for (const inv of invRows.rows) {
    const destWhId = await resolveDestWarehouseForSource(
      client,
      destTenantId,
      inv.warehouse_id,
      sourceWhCodeById,
      destWhByCode,
      defaultDestWhId
    );
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
      defaultDestWhId
    );
    const batchId = generateId('batch');
    await setTenantContext(client, destTenantId);
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
}

async function ensureInventoryRow(
  client: PoolClient,
  destTenantId: string,
  destProductId: string,
  warehouseId: string
) {
  await setTenantContext(client, destTenantId);
  await client.query(
    `INSERT INTO shop_inventory (tenant_id, product_id, warehouse_id, quantity_on_hand)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (tenant_id, product_id, warehouse_id) DO NOTHING`,
    [destTenantId, destProductId, warehouseId]
  );
}

/**
 * Phase 3: migrate SKUs using categoryIdMap and brandIdMap from earlier phases.
 */
async function migrateAllSkus(
  client: PoolClient,
  fromTenantId: string,
  toTenantId: string,
  categoryIdMap: Map<string, string>,
  brandIdMap: Map<string, string>,
  dryRun: boolean,
  updateExisting: boolean,
  withInventory: boolean,
  verbose: boolean
): Promise<SkuStats> {
  const stats: SkuStats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  const sourceProducts = await fetchProducts(client, fromTenantId);
  const existingSkus = await fetchExistingSkus(client, toTenantId);

  const sourceWhCodeById = await loadSourceWarehouseMap(client, fromTenantId);
  const destWhByCode = new Map<string, string>();
  await setTenantContext(client, toTenantId);
  const destWhRows = await client.query<{ id: string; code: string }>(
    `SELECT id, code FROM shop_warehouses WHERE tenant_id = $1`,
    [toTenantId]
  );
  for (const w of destWhRows.rows) destWhByCode.set(w.code, w.id);
  const defaultDestWhId = await ensureDestWarehouse(client, toTenantId);

  console.log('\n=== Phase 3: SKUs (after categories + brands) ===');
  console.log(`Source SKUs: ${sourceProducts.length}`);
  console.log(`Destination SKUs already present: ${existingSkus.size}`);

  for (const src of sourceProducts) {
    const sku = String(src.sku ?? '').trim();
    if (!sku) {
      console.warn(`  [skip] product ${src.id} has empty sku`);
      stats.skipped++;
      continue;
    }

    const skuKey = sku.toLowerCase();
    const existingDestId = existingSkus.get(skuKey);

    try {
      const destCategoryId = resolveMappedCategoryId(
        categoryIdMap,
        (src.category_id as string) ?? null,
        dryRun
      );
      const destSubcategoryId = resolveMappedCategoryId(
        categoryIdMap,
        (src.subcategory_id as string) ?? null,
        dryRun
      );
      const brandId = await resolveBrandIdForSku(
        client,
        toTenantId,
        brandIdMap,
        (src.brand_id as string) ?? null,
        src.brand as string | null,
        dryRun
      );

      if (existingDestId) {
        if (!updateExisting) {
          stats.skipped++;
          continue;
        }
        if (dryRun) {
          if (verbose) console.log(`  [sku update] ${sku}`);
          stats.updated++;
          continue;
        }
        await updateProduct(
          client,
          toTenantId,
          existingDestId,
          src,
          destCategoryId,
          destSubcategoryId,
          brandId
        );
        if (withInventory) {
          await copyInventoryForProduct(
            client,
            fromTenantId,
            toTenantId,
            src.id as string,
            existingDestId,
            sourceWhCodeById,
            destWhByCode,
            defaultDestWhId
          );
        } else {
          await ensureInventoryRow(client, toTenantId, existingDestId, defaultDestWhId);
        }
        stats.updated++;
        continue;
      }

      if (dryRun) {
        if (verbose) console.log(`  [sku insert] ${sku} — ${src.name}`);
        stats.inserted++;
        continue;
      }

      const newProductId = await insertProduct(
        client,
        toTenantId,
        src,
        destCategoryId,
        destSubcategoryId,
        brandId
      );
      existingSkus.set(skuKey, newProductId);

      if (withInventory) {
        await copyInventoryForProduct(
          client,
          fromTenantId,
          toTenantId,
          src.id as string,
          newProductId,
          sourceWhCodeById,
          destWhByCode,
          defaultDestWhId
        );
      } else {
        await ensureInventoryRow(client, toTenantId, newProductId, defaultDestWhId);
      }
      stats.inserted++;
    } catch (err: unknown) {
      stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [sku error] ${sku}: ${msg}`);
    }
  }

  console.log('SKU summary:', stats);
  return stats;
}

async function main() {
  const dryRun =
    process.env.DRY_RUN === '1' ||
    process.env.DRY_RUN === 'true' ||
    !process.argv.includes('--execute');
  const verbose = process.env.VERBOSE === '1' || process.argv.includes('--verbose');

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

  console.log('Source:', fromTenant);
  console.log('Destination:', toTenant);
  console.log(`Mode: ${dryRun ? 'DRY RUN (pass --execute to apply)' : 'EXECUTE'}`);
  console.log(`Options: withInventory=${args.withInventory}, updateExisting=${args.updateExisting}`);
  console.log('Migration order: categories → brands → SKUs');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { categoryIdMap } = await migrateAllCategories(
      client,
      fromTenant.id,
      toTenant.id,
      dryRun,
      args.updateExisting,
      verbose
    );

    const { brandIdMap } = await migrateAllBrands(
      client,
      fromTenant.id,
      toTenant.id,
      dryRun,
      verbose
    );

    const skuStats = await migrateAllSkus(
      client,
      fromTenant.id,
      toTenant.id,
      categoryIdMap,
      brandIdMap,
      dryRun,
      args.updateExisting,
      args.withInventory,
      verbose
    );

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\nDRY RUN complete — no changes written. Re-run with --execute to apply.');
    } else {
      await client.query('COMMIT');
      console.log('\nMigration committed (categories, brands, SKUs).');
      console.log('Tip: run `npm run typesense:index` in server/ if search indexing is enabled.');
    }

    console.log('\nFinal SKU stats:', skuStats);
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
