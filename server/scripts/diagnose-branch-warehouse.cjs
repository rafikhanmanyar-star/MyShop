require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pg = require('pg');

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  for (const slug of ['obo', 'testshop']) {
    const t = await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (!t.rows[0]) continue;
    const tid = t.rows[0].id;
    console.log('\n===', slug, '===');
    const branches = await pool.query('SELECT id, name FROM shop_branches WHERE tenant_id = $1', [tid]);
    const wh = await pool.query('SELECT id, name FROM shop_warehouses WHERE tenant_id = $1', [tid]);
    console.log('branches:', branches.rows);
    console.log('warehouses:', wh.rows);
    const branchIds = new Set(branches.rows.map((b) => b.id));
    const whIds = new Set(wh.rows.map((w) => w.id));

    const invKeys = await pool.query(
      `SELECT DISTINCT i.warehouse_id, COUNT(*)::int AS rows
       FROM shop_inventory i WHERE i.tenant_id = $1 GROUP BY i.warehouse_id`,
      [tid]
    );
    for (const row of invKeys.rows) {
      console.log('inv warehouse_id', row.warehouse_id, 'rows', row.rows,
        'is_branch_id', branchIds.has(row.warehouse_id),
        'is_warehouse_id', whIds.has(row.warehouse_id));
    }

    const overlap = [...branchIds].filter((id) => whIds.has(id));
    console.log('branch ids that are also warehouse ids:', overlap.length, overlap.slice(0, 3));

    if (branches.rows[0]) {
      const bid = branches.rows[0].id;
      const stockAtBranch = await pool.query(
        `SELECT COUNT(*)::int AS products_with_branch_key
         FROM shop_products p
         WHERE p.tenant_id = $1 AND COALESCE(p.is_active,true)
           AND EXISTS (SELECT 1 FROM shop_inventory i WHERE i.tenant_id = p.tenant_id AND i.product_id = p.id AND i.warehouse_id = $2)`,
        [tid, bid]
      );
      console.log('products with inventory at first branch id as warehouse_id:', stockAtBranch.rows[0]);
    }
  }
  await pool.end();
}

main().catch(console.error);
