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
    const tenants = await pool.query(`SELECT id, slug FROM tenants WHERE slug IN ('obo','obostores')`);
    const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const t of tenants.rows) {
      console.log(`\n=== ${t.slug} sync delta sizes ===`);
      for (const [label, since] of [
        ['1h', since1h],
        ['24h', since24h],
        ['7d', since7d],
      ]) {
        const products = await q(
          pool,
          `SELECT COUNT(*)::int AS n FROM shop_products WHERE tenant_id = $1 AND updated_at > $2`,
          [t.id, since]
        );
        const inventory = await q(
          pool,
          `SELECT COUNT(*)::int AS n FROM shop_inventory WHERE tenant_id = $1 AND updated_at > $2`,
          [t.id, since]
        );
        const sales = await q(
          pool,
          `SELECT COUNT(*)::int AS n FROM shop_sales WHERE tenant_id = $1 AND created_at > $2`,
          [t.id, since]
        );
        console.log(
          JSON.stringify({
            window: label,
            products_changed: products.rows[0].n,
            inventory_changed: inventory.rows[0].n,
            sales_created: sales.rows[0].n,
          })
        );
      }

      const rt = await q(
        pool,
        `SELECT COUNT(*)::int AS n FROM shop_sales WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '15 minutes'`,
        [t.id]
      );
      console.log('sales last 15 min (realtime churn):', rt.rows[0]);

      const contacts = await q(
        pool,
        `SELECT COUNT(*)::int AS n FROM contacts WHERE tenant_id = $1`,
        [t.id]
      );
      const loyalty = await q(
        pool,
        `SELECT COUNT(*)::int AS n FROM shop_loyalty_members WHERE tenant_id = $1`,
        [t.id]
      );
      console.log('bootstrap extras:', { contacts: contacts.rows[0].n, loyalty: loyalty.rows[0].n });

      const bulkUpdate = await q(
        pool,
        `SELECT date_trunc('minute', updated_at) AS minute, COUNT(*)::int AS n
         FROM shop_products WHERE tenant_id = $1 AND updated_at > NOW() - INTERVAL '2 hours'
         GROUP BY 1 ORDER BY n DESC LIMIT 5`,
        [t.id]
      );
      console.log('recent bulk product update spikes:', bulkUpdate.rows);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
