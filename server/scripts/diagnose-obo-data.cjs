require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pg = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) return console.log('NO DATABASE_URL');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const obo = await pool.query(`SELECT id FROM tenants WHERE slug = 'obo' LIMIT 1`);
    const tk = await pool.query(`SELECT id FROM tenants WHERE slug = 'tk-shop' LIMIT 1`);
    const oboId = obo.rows[0]?.id;
    const tkId = tk.rows[0]?.id;
    if (!oboId || !tkId) {
      console.log('Missing tenant ids', { oboId, tkId });
      return;
    }

    for (const [label, tid] of [['obo', oboId], ['tk-shop', tkId]]) {
      const dupInv = await pool.query(
        `SELECT product_id, warehouse_id, COUNT(*)::int AS n
         FROM shop_inventory WHERE tenant_id = $1
         GROUP BY product_id, warehouse_id HAVING COUNT(*) > 1 LIMIT 5`,
        [tid]
      );
      const dupBarcode = await pool.query(
        `SELECT barcode, COUNT(*)::int AS n FROM shop_products
         WHERE tenant_id = $1 AND barcode IS NOT NULL AND trim(barcode) <> ''
         GROUP BY barcode HAVING COUNT(*) > 1 LIMIT 5`,
        [tid]
      );
      const nullName = await pool.query(
        `SELECT COUNT(*)::int AS n FROM shop_products WHERE tenant_id = $1 AND (name IS NULL OR trim(name) = '')`,
        [tid]
      );
      const categories = await pool.query(
        `SELECT COUNT(*)::int AS n FROM categories WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tid]
      );
      const t0 = Date.now();
      await pool.query(
        `SELECT COUNT(*)::int AS n FROM shop_products p
         LEFT JOIN shop_inventory i ON i.product_id = p.id AND i.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND COALESCE(p.is_active, true)`,
        [tid]
      );
      const simpleMs = Date.now() - t0;

      console.log(JSON.stringify({
        tenant: label,
        duplicate_inventory_pairs: dupInv.rows.length,
        duplicate_barcodes: dupBarcode.rows,
        empty_product_names: nullName.rows[0].n,
        categories: categories.rows[0].n,
        simple_join_ms: simpleMs,
      }));
    }

    // Inventory rows per product for obo
    const oboInvPerProd = await pool.query(
      `SELECT COUNT(*)::int AS products,
              SUM(cnt)::int AS inventory_rows,
              MAX(cnt)::int AS max_rows_per_product
       FROM (
         SELECT product_id, COUNT(*)::int AS cnt
         FROM shop_inventory WHERE tenant_id = $1
         GROUP BY product_id
       ) s`,
      [oboId]
    );
    console.log('obo inventory density:', oboInvPerProd.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
