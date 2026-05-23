require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pg = require('pg');

async function q(pool, sql, params = []) {
  const t0 = Date.now();
  const r = await pool.query(sql, params);
  return { ms: Date.now() - t0, rows: r.rows, rowCount: r.rowCount };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) return console.log('NO DATABASE_URL');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const tenants = await pool.query(`
      SELECT id, slug, company_name FROM tenants
      WHERE slug IN ('obo', 'testshop', 'tk-shop', 'tkshop')
         OR lower(company_name) LIKE '%test%shop%'
         OR lower(slug) LIKE '%test%'
      ORDER BY slug NULLS LAST
    `);
    console.log('=== TENANTS ===');
    for (const t of tenants.rows) console.log(t.slug, t.company_name, t.id);

    for (const t of tenants.rows) {
      console.log('\n=== STATS:', t.slug, '===');
      const stats = await q(
        pool,
        `SELECT
          (SELECT COUNT(*)::int FROM shop_products p WHERE p.tenant_id = $1 AND COALESCE(p.is_active,true)) AS products,
          (SELECT COUNT(*)::int FROM shop_inventory i WHERE i.tenant_id = $1) AS inventory,
          (SELECT COUNT(*)::int FROM inventory_batches b WHERE b.tenant_id = $1) AS batches,
          (SELECT COUNT(*)::int FROM categories c WHERE c.tenant_id = $1 AND c.deleted_at IS NULL) AS categories,
          (SELECT COUNT(*)::int FROM categories c WHERE c.tenant_id = $1 AND c.deleted_at IS NULL AND c.parent_id IS NOT NULL) AS subcategories,
          (SELECT MAX(LENGTH(COALESCE(p.name,'')))::int FROM shop_products p WHERE p.tenant_id = $1) AS max_name_len,
          (SELECT COUNT(*)::int FROM shop_products p WHERE p.tenant_id = $1 AND (p.category_id IS NULL OR p.category_id = '')) AS no_category,
          (SELECT COUNT(*)::int FROM shop_products p WHERE p.tenant_id = $1 AND p.retail_price IS NULL) AS null_price,
          (SELECT COUNT(*)::int FROM shop_products p WHERE p.tenant_id = $1 AND COALESCE(p.retail_price,0) <= 0) AS zero_price,
          (SELECT COUNT(*)::int FROM shop_products p WHERE p.tenant_id = $1 AND p.image_url IS NOT NULL AND length(p.image_url) > 200) AS long_image_urls
        `,
        [t.id]
      );
      console.log(stats.rows[0]);

      const dupBarcode = await q(
        pool,
        `SELECT barcode, COUNT(*)::int AS n FROM shop_products
         WHERE tenant_id = $1 AND barcode IS NOT NULL AND trim(barcode) <> ''
         GROUP BY barcode HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 10`,
        [t.id]
      );
      console.log('duplicate_barcodes:', dupBarcode.rows);

      const orphanCat = await q(
        pool,
        `SELECT COUNT(*)::int AS n FROM shop_products p
         WHERE p.tenant_id = $1 AND p.category_id IS NOT NULL AND p.category_id <> ''
           AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.tenant_id = p.tenant_id AND c.deleted_at IS NULL)`,
        [t.id]
      );
      console.log('orphan_category_refs:', orphanCat.rows[0]);

      const cyclicCat = await q(
        pool,
        `WITH RECURSIVE cat AS (
           SELECT id, parent_id, 1 AS depth, ARRAY[id] AS path
           FROM categories WHERE tenant_id = $1 AND deleted_at IS NULL
           UNION ALL
           SELECT c.id, c.parent_id, cat.depth + 1, cat.path || c.id
           FROM categories c JOIN cat ON c.id = cat.parent_id AND c.tenant_id = $1 AND c.deleted_at IS NULL
           WHERE NOT c.id = ANY(cat.path) AND cat.depth < 20
         )
         SELECT COUNT(*)::int AS deep_nodes FROM cat WHERE depth >= 10`,
        [t.id]
      );
      console.log('deep_category_nodes (depth>=10):', cyclicCat.rows[0]);

      const invMismatch = await q(
        pool,
        `SELECT COUNT(*)::int AS products_without_inventory FROM shop_products p
         WHERE p.tenant_id = $1 AND COALESCE(p.is_active,true)
           AND NOT EXISTS (SELECT 1 FROM shop_inventory i WHERE i.tenant_id = p.tenant_id AND i.product_id = p.id)`,
        [t.id]
      );
      console.log('products_without_inventory:', invMismatch.rows[0]);

      const batchNoExpiry = await q(
        pool,
        `SELECT COUNT(*)::int AS n FROM inventory_batches WHERE tenant_id = $1 AND expiry_date IS NULL`,
        [t.id]
      );
      console.log('batches_null_expiry:', batchNoExpiry.rows[0]);

      const terminals = await q(
        pool,
        `SELECT id, name, branch_id, is_active FROM shop_terminals WHERE tenant_id = $1`,
        [t.id]
      );
      console.log('terminals:', terminals.rows);

      const posSessions = await q(
        pool,
        `SELECT COUNT(*)::int AS n FROM user_sessions
         WHERE tenant_id = $1 AND pos_terminal_id IS NOT NULL AND expires_at > NOW()`,
        [t.id]
      );
      console.log('active_pos_sessions:', posSessions.rows[0]);
    }

    const obo = tenants.rows.find((t) => t.slug === 'obo');
    if (obo) {
      console.log('\n=== OBO listInventorySkus-style count query timing ===');
      const countQ = await q(
        pool,
        `SELECT COUNT(*)::int AS n FROM shop_products p
         WHERE p.tenant_id = $1 AND COALESCE(p.is_active, true)`,
        [obo.id]
      );
      console.log('simple product count', countQ.ms, 'ms', countQ.rows[0]);

      const batchQ = await q(
        pool,
        `SELECT COUNT(DISTINCT product_id)::int AS products_with_batches
         FROM inventory_batches WHERE tenant_id = $1`,
        [obo.id]
      );
      console.log('products_with_batches:', batchQ.rows[0], batchQ.ms, 'ms');
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
