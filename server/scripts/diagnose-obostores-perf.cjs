require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pg = require('pg');

async function q(pool, label, sql, params = []) {
  const t0 = Date.now();
  const r = await pool.query(sql, params);
  const ms = Date.now() - t0;
  return { label, ms, rows: r.rows, rowCount: r.rowCount };
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
      `SELECT id, slug, company_name FROM tenants WHERE slug IN ('obostores','obo','tk-shop') ORDER BY slug`
    );

    for (const t of tenants.rows) {
      const dup = await q(
        pool,
        `${t.slug} dup inventory`,
        `SELECT product_id, warehouse_id, COUNT(*)::int AS n
         FROM shop_inventory WHERE tenant_id = $1
         GROUP BY product_id, warehouse_id HAVING COUNT(*) > 1
         ORDER BY n DESC LIMIT 5`,
        [t.id]
      );
      const extra = await q(
        pool,
        `${t.slug} extra dup rows`,
        `SELECT COALESCE(SUM(n - 1), 0)::int AS extra
         FROM (
           SELECT COUNT(*)::int AS n FROM shop_inventory WHERE tenant_id = $1
           GROUP BY product_id, warehouse_id HAVING COUNT(*) > 1
         ) s`,
        [t.id]
      );
      const wh = await q(
        pool,
        `${t.slug} warehouses`,
        `SELECT COUNT(DISTINCT warehouse_id)::int AS wh FROM shop_inventory WHERE tenant_id = $1`,
        [t.id]
      );
      console.log(JSON.stringify({
        slug: t.slug,
        id: t.id,
        duplicate_pairs: dup.rows.length,
        sample_duplicates: dup.rows,
        extra_duplicate_rows: extra.rows[0]?.extra ?? 0,
        distinct_warehouses: wh.rows[0]?.wh ?? 0,
      }));
    }

    const LIST_SKUS_SQL = `
      WITH batch_sellable AS (
        SELECT tenant_id, product_id, warehouse_id,
          COALESCE(SUM(quantity_remaining) FILTER (
            WHERE quantity_remaining > 0
              AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
          ), 0)::numeric AS batch_sellable_sum
        FROM inventory_batches
        WHERE tenant_id = $1
        GROUP BY tenant_id, product_id, warehouse_id
      ),
      batch_wh AS (
        SELECT DISTINCT tenant_id, product_id, warehouse_id
        FROM inventory_batches
        WHERE tenant_id = $1
      ),
      i_enriched AS (
        SELECT
          i.tenant_id,
          i.product_id,
          i.warehouse_id,
          i.quantity_on_hand,
          i.quantity_reserved,
          GREATEST(0,
            CASE
              WHEN bw.product_id IS NOT NULL
              THEN GREATEST(0, COALESCE(bs.batch_sellable_sum, 0) - COALESCE(i.quantity_reserved, 0))
              ELSE GREATEST(COALESCE(i.quantity_on_hand, 0) - COALESCE(i.quantity_reserved, 0), 0)
            END
          )::numeric AS sellable_on_hand
        FROM shop_inventory i
        LEFT JOIN batch_sellable bs
          ON bs.tenant_id = i.tenant_id AND bs.product_id = i.product_id AND bs.warehouse_id = i.warehouse_id
        LEFT JOIN batch_wh bw
          ON bw.tenant_id = i.tenant_id AND bw.product_id = i.product_id AND bw.warehouse_id = i.warehouse_id
        WHERE i.tenant_id = $1
      ),
      inv_agg AS (
        SELECT
          ie.product_id,
          COALESCE(SUM(ie.quantity_on_hand), 0)::numeric AS on_hand,
          COALESCE(SUM(ie.sellable_on_hand), 0)::numeric AS available,
          COALESCE(SUM(ie.quantity_reserved), 0)::numeric AS reserved_total,
          COALESCE(
            jsonb_object_agg(ie.warehouse_id::text, ie.quantity_on_hand)
              FILTER (WHERE ie.warehouse_id IS NOT NULL),
            '{}'::jsonb
          ) AS warehouse_stock,
          COALESCE(
            jsonb_object_agg(ie.warehouse_id::text, ie.sellable_on_hand)
              FILTER (WHERE ie.warehouse_id IS NOT NULL),
            '{}'::jsonb
          ) AS warehouse_sellable,
          COALESCE(
            jsonb_object_agg(ie.warehouse_id::text, ie.quantity_reserved)
              FILTER (WHERE ie.warehouse_id IS NOT NULL),
            '{}'::jsonb
          ) AS warehouse_reserved
        FROM i_enriched ie
        GROUP BY ie.product_id
      ),
      pa AS (
        SELECT
          p.id, p.sku, p.barcode, p.name, p.category_id, p.subcategory_id, p.unit,
          p.cost_price, p.retail_price, p.reorder_point, p.image_url, p.mobile_description,
          COALESCE(p.sales_deactivated, FALSE) AS sales_deactivated,
          p.brand, p.brand_id, p.weight, p.weight_unit, p.size, p.color, p.material,
          p.origin_country, p.attributes,
          COALESCE(ia.on_hand, 0)::numeric AS on_hand,
          COALESCE(ia.available, 0)::numeric AS available,
          COALESCE(ia.reserved_total, 0)::numeric AS reserved_total,
          COALESCE(ia.warehouse_stock, '{}'::jsonb) AS warehouse_stock,
          COALESCE(ia.warehouse_sellable, '{}'::jsonb) AS warehouse_sellable,
          COALESCE(ia.warehouse_reserved, '{}'::jsonb) AS warehouse_reserved
        FROM shop_products p
        LEFT JOIN inv_agg ia ON ia.product_id = p.id
        WHERE p.tenant_id = $1 AND p.is_active = TRUE
      ),
      counted AS (
        SELECT f.*, COUNT(*) OVER ()::int AS __total FROM pa f
      )
      SELECT * FROM counted ORDER BY name ASC NULLS LAST, sku ASC NULLS LAST LIMIT 10000 OFFSET 0
    `;

    console.log('\n=== listInventorySkus timing (forPos=true, no expiry agg) ===');
    for (const t of tenants.rows) {
      const r = await q(pool, t.slug, LIST_SKUS_SQL, [t.id]);
      const payloadBytes = JSON.stringify(r.rows).length;
      console.log(JSON.stringify({
        slug: t.slug,
        ms: r.ms,
        rows: r.rowCount,
        payload_mb: (payloadBytes / 1024 / 1024).toFixed(2),
      }));
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
