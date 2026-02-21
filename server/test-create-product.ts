import 'dotenv/config';
import { DatabaseService } from './dist/services/databaseService.js';
import { ShopService } from './dist/services/shopService.js';

async function test() {
    console.log('Test started');
    const db = new DatabaseService(process.env.DATABASE_URL);
    const shop = new ShopService();
    shop.db = db;

    try {
        const tenants = await db.query('SELECT id FROM tenants LIMIT 1');
        if (tenants.length === 0) { console.log('No tenants'); return; }
        const tenantId = tenants[0].id;
        console.log('Tenant:', tenantId);

        await shop.createProduct(tenantId, {
            name: 'Bread of Butter',
            sku: 'SKU-' + Date.now(),
            category_id: 'General'
        });
    } catch (err) {
        console.error('Captured Error:', err);
    } finally {
        process.exit(0);
    }
}

test();
