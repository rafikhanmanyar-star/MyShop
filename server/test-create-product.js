require('dotenv').config();
const { DatabaseService } = require('./dist/services/databaseService.js');
const { ShopService } = require('./dist/services/shopService.js');

async function test() {
    const db = new DatabaseService(process.env.DATABASE_URL);
    const shop = new ShopService();
    shop.db = db;

    // Find a tenant
    const tenants = await db.query('SELECT id FROM tenants LIMIT 1');
    if (tenants.length === 0) {
        console.log('No tenants found');
        process.exit(0);
    }
    const tenantId = tenants[0].id;

    try {
        console.log(`Creating product for tenant ${tenantId}...`);
        const id = await shop.createProduct(tenantId, {
            name: 'Test Product ' + Date.now(),
            sku: 'TEST-' + Date.now(),
            category_id: 'General'
        });
        console.log('Success! ID:', id);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.close();
    }
}

test();
