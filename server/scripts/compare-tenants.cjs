require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pg = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('NO DATABASE_URL');
    return;
  }
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const tenants = await pool.query(`
      SELECT id, slug, company_name
      FROM tenants
      WHERE slug IN ('tkshop', 'obo')
         OR lower(company_name) LIKE '%obo%'
         OR lower(slug) LIKE '%tk%'
      ORDER BY slug NULLS LAST, company_name
    `);
    console.log('Tenants found:', tenants.rows.length);
    for (const t of tenants.rows) {
      const stats = await pool.query(
        `SELECT
          (SELECT COUNT(*)::int FROM shop_products p WHERE p.tenant_id = $1 AND COALESCE(p.is_active, true)) AS products,
          (SELECT COUNT(*)::int FROM shop_inventory i WHERE i.tenant_id = $1) AS inventory,
          (SELECT COUNT(*)::int FROM inventory_batches b WHERE b.tenant_id = $1) AS batches,
          (SELECT COUNT(*)::int FROM mobile_customers mc WHERE mc.tenant_id = $1) AS mobile_customers,
          (SELECT COUNT(*)::int FROM shop_loyalty_members m WHERE m.tenant_id = $1) AS loyalty_members,
          (SELECT COUNT(*)::int FROM contacts c WHERE c.tenant_id = $1) AS contacts,
          (SELECT COUNT(*)::int FROM shop_terminals st WHERE st.tenant_id = $1) AS terminals`,
        [t.id]
      );
      const backfill = await pool.query(
        `SELECT COUNT(*)::int AS needs_loyalty
         FROM mobile_customers mc
         WHERE mc.tenant_id = $1
           AND NULLIF(trim(mc.phone), '') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM shop_loyalty_members m
             INNER JOIN contacts c ON c.id = m.customer_id AND c.tenant_id = mc.tenant_id
             WHERE m.tenant_id = mc.tenant_id
               AND regexp_replace(COALESCE(mc.phone, ''), '[^0-9]', '', 'g')
                 = regexp_replace(COALESCE(c.contact_no, ''), '[^0-9]', '', 'g')
               AND length(regexp_replace(COALESCE(mc.phone, ''), '[^0-9]', '', 'g')) > 0
           )`,
        [t.id]
      );
      console.log(JSON.stringify({
        slug: t.slug,
        company: t.company_name,
        id: t.id,
        ...stats.rows[0],
        needs_loyalty_backfill: backfill.rows[0].needs_loyalty,
      }));
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
