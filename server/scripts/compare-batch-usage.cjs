require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pg = require('pg');

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  for (const slug of ['obo', 'testshop', 'tk-shop']) {
    const t = await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (!t.rows[0]) {
      console.log(slug, 'NOT FOUND');
      continue;
    }
    const id = t.rows[0].id;
    const s = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM shop_products WHERE tenant_id = $1 AND COALESCE(is_active, true)) AS products,
        (SELECT COUNT(*)::int FROM inventory_batches WHERE tenant_id = $1) AS batches,
        (SELECT COUNT(DISTINCT product_id)::int FROM inventory_batches WHERE tenant_id = $1) AS products_with_batches,
        (SELECT COUNT(*)::int FROM categories WHERE tenant_id = $1 AND deleted_at IS NULL) AS categories`,
      [id]
    );
    console.log(slug, s.rows[0]);
  }
  await pool.end();
}

main();
