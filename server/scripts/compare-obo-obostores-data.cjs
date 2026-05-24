require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pg = require('pg');

async function q(pool, sql, params = []) {
  const t0 = Date.now();
  const r = await pool.query(sql, params);
  return { ms: Date.now() - t0, rows: r.rows };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) return console.log('NO DATABASE_URL');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const tenants = await pool.query(
      `SELECT id, slug, company_name FROM tenants WHERE slug IN ('obo','obostores') ORDER BY slug`
    );
    const bySlug = Object.fromEntries(tenants.rows.map((t) => [t.slug, t.id]));

    for (const slug of ['obo', 'obostores']) {
      const tid = bySlug[slug];
      console.log(`\n========== ${slug.toUpperCase()} (${tid}) ==========`);

      const stats = await q(
        pool,
        `SELECT
          (SELECT COUNT(*)::int FROM shop_products WHERE tenant_id = $1 AND COALESCE(is_active,true)) AS products,
          (SELECT COUNT(*)::int FROM shop_inventory WHERE tenant_id = $1) AS inventory,
          (SELECT COUNT(*)::int FROM inventory_batches WHERE tenant_id = $1) AS batches,
          (SELECT COUNT(*)::int FROM categories WHERE tenant_id = $1 AND deleted_at IS NULL) AS categories,
          (SELECT COUNT(DISTINCT warehouse_id)::int FROM shop_inventory WHERE tenant_id = $1) AS warehouses,
          (SELECT MAX(octet_length(COALESCE(attributes::text,'')))::int FROM shop_products WHERE tenant_id = $1) AS max_attrs_bytes,
          (SELECT AVG(octet_length(COALESCE(attributes::text,'')))::int FROM shop_products WHERE tenant_id = $1) AS avg_attrs_bytes,
          (SELECT COUNT(*)::int FROM shop_products WHERE tenant_id = $1 AND attributes IS NOT NULL AND attributes::text NOT IN ('{}','null','') AND octet_length(attributes::text) > 500) AS large_attrs,
          (SELECT COUNT(*)::int FROM shop_products WHERE tenant_id = $1 AND attributes IS NOT NULL AND attributes::text !~ '^\\{' ) AS invalid_attrs_json,
          (SELECT MAX(octet_length(COALESCE(mobile_description,'')))::int FROM shop_products WHERE tenant_id = $1) AS max_desc_len,
          (SELECT COUNT(*)::int FROM shop_products WHERE tenant_id = $1 AND mobile_description IS NOT NULL AND length(mobile_description) > 2000) AS long_descriptions,
          (SELECT COUNT(*)::int FROM shop_products WHERE tenant_id = $1 AND image_url IS NOT NULL AND length(image_url) > 300) AS long_image_urls,
          (SELECT COUNT(*)::int FROM shop_products WHERE tenant_id = $1 AND length(name) > 80) AS long_names
        `,
        [tid]
      );
      console.log('stats:', stats.rows[0]);

      const whStock = await q(
        pool,
        `SELECT p.id, p.sku, p.name,
                octet_length(COALESCE(p.attributes::text,'')) AS attrs_bytes,
                (SELECT COUNT(*)::int FROM shop_inventory i WHERE i.tenant_id = p.tenant_id AND i.product_id = p.id) AS inv_rows,
                (SELECT COUNT(*)::int FROM inventory_batches b WHERE b.tenant_id = p.tenant_id AND b.product_id = p.id) AS batch_rows
         FROM shop_products p
         WHERE p.tenant_id = $1 AND COALESCE(p.is_active,true)
         ORDER BY octet_length(COALESCE(p.attributes::text,'')) DESC NULLS LAST
         LIMIT 8`,
        [tid]
      );
      console.log('top heavy attribute products:', whStock.rows);

      const dupBarcode = await q(
        pool,
        `SELECT barcode, COUNT(*)::int AS n, array_agg(sku ORDER BY sku) AS skus
         FROM shop_products WHERE tenant_id = $1 AND barcode IS NOT NULL AND trim(barcode) <> ''
         GROUP BY barcode HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 5`,
        [tid]
      );
      console.log('duplicate barcodes:', dupBarcode.rows);

      const orphanCat = await q(
        pool,
        `SELECT COUNT(*)::int AS n FROM shop_products p
         WHERE p.tenant_id = $1 AND p.category_id IS NOT NULL AND p.category_id <> ''
           AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.tenant_id = p.tenant_id AND c.deleted_at IS NULL)`,
        [tid]
      );
      console.log('orphan category refs:', orphanCat.rows[0]);

      const deepCat = await q(
        pool,
        `WITH RECURSIVE cat AS (
           SELECT id, parent_id, 1 AS depth, ARRAY[id] AS path, name
           FROM categories WHERE tenant_id = $1 AND deleted_at IS NULL
           UNION ALL
           SELECT c.id, c.parent_id, cat.depth + 1, cat.path || c.id, c.name
           FROM categories c JOIN cat ON c.id = cat.parent_id AND c.tenant_id = $1 AND c.deleted_at IS NULL
           WHERE NOT c.id = ANY(cat.path) AND cat.depth < 30
         )
         SELECT MAX(depth)::int AS max_depth, COUNT(*) FILTER (WHERE depth >= 10)::int AS nodes_depth_10plus FROM cat`,
        [tid]
      );
      console.log('category depth:', deepCat.rows[0]);

      const batchHeavy = await q(
        pool,
        `SELECT product_id, COUNT(*)::int AS batch_count
         FROM inventory_batches WHERE tenant_id = $1
         GROUP BY product_id ORDER BY batch_count DESC LIMIT 5`,
        [tid]
      );
      console.log('heaviest batch products:', batchHeavy.rows);

      const syncMeta = await q(
        pool,
        `SELECT COUNT(*)::int AS pending_sales FROM shop_sales WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
        [tid]
      );
      console.log('recent sales (7d):', syncMeta.rows[0]);

      const updatedRecently = await q(
        pool,
        `SELECT COUNT(*)::int AS n FROM shop_products WHERE tenant_id = $1 AND updated_at > NOW() - INTERVAL '1 hour'`,
        [tid]
      );
      console.log('products updated last hour:', updatedRecently.rows[0]);
    }

    // Compare delta sync churn: products with very frequent inventory updates
    for (const slug of ['obo', 'obostores']) {
      const tid = bySlug[slug];
      const churn = await q(
        pool,
        `SELECT COUNT(*)::int AS inv_updated_24h
         FROM shop_inventory WHERE tenant_id = $1 AND updated_at > NOW() - INTERVAL '24 hours'`,
        [tid]
      );
      console.log(`${slug} inventory rows updated 24h:`, churn.rows[0]);
    }

    // Sample attributes that might break JSON parse on client
    const oboId = bySlug['obo'];
    const badAttrs = await q(
      pool,
      `SELECT id, sku, left(attributes::text, 200) AS attrs_preview
       FROM shop_products
       WHERE tenant_id = $1 AND attributes IS NOT NULL
         AND (attributes::text LIKE '%NaN%' OR attributes::text LIKE '%undefined%' OR attributes::text LIKE '%Infinity%')
       LIMIT 10`,
      [oboId]
    );
    console.log('\nobo suspicious attributes:', badAttrs.rows);

    const oboVsObostoresSkuDiff = await q(
      pool,
      `SELECT
        (SELECT COUNT(*)::int FROM shop_products WHERE tenant_id = $1 AND COALESCE(is_active,true)) AS obo_only_active,
        (SELECT COUNT(*)::int FROM shop_products WHERE tenant_id = $2 AND COALESCE(is_active,true)) AS obostores_active,
        (SELECT COUNT(*)::int FROM shop_products o
          WHERE o.tenant_id = $1 AND COALESCE(o.is_active,true)
            AND NOT EXISTS (SELECT 1 FROM shop_products s WHERE s.tenant_id = $2 AND s.sku = o.sku)) AS obo_skus_not_in_obostores`,
      [oboId, bySlug['obostores']]
    );
    console.log('\nsku overlap:', oboVsObostoresSkuDiff.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
