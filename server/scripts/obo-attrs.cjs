require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pg = require('pg');
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const obo = (await pool.query(`SELECT id FROM tenants WHERE slug='obo'`)).rows[0].id;
  const r = await pool.query(
    `SELECT
      MAX(length(COALESCE(attributes::text,'')))::int AS max_attrs,
      MAX(length(COALESCE(mobile_description,'')))::int AS max_desc,
      COUNT(*) FILTER (WHERE attributes IS NOT NULL AND attributes::text NOT IN ('null','{}','[]'))::int AS with_attrs
     FROM shop_products WHERE tenant_id=$1`,
    [obo]
  );
  console.log(r.rows[0]);
  await pool.end();
}
main();
