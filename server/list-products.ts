import 'dotenv/config';
import { Pool } from 'pg';

async function test() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        const res = await pool.query('SELECT name, sku FROM shop_products');
        console.log('PRODUCTS_FOUND:', res.rows.length);
        res.rows.forEach(r => console.log(` - ${r.name} (${r.sku})`));
    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}
test();
