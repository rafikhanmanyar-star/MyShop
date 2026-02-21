const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../myshop.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

const tenantId = 'default';

// Add Categories
const catIds = {
    coffee: 'cat-coffee',
    pastries: 'cat-pastries'
};

db.prepare(`INSERT OR IGNORE INTO categories (id, tenant_id, name) VALUES (?, ?, ?)`).run(
    catIds.coffee, tenantId, 'Coffee & Espresso'
);
db.prepare(`INSERT OR IGNORE INTO categories (id, tenant_id, name) VALUES (?, ?, ?)`).run(
    catIds.pastries, tenantId, 'Bakery & Pastries'
);

const products = [
    { id: 'prod-1', name: 'Latte', description: 'Classic espresso with steamed milk', price: 4.50, sku: 'COF-LAT', cat: catIds.coffee },
    { id: 'prod-2', name: 'Cappuccino', description: 'Espresso topped with frothy milk foam', price: 4.50, sku: 'COF-CAP', cat: catIds.coffee },
    { id: 'prod-3', name: 'Croissant', description: 'Buttery, flaky pastry', price: 3.50, sku: 'BAK-CRO', cat: catIds.pastries },
    { id: 'prod-4', name: 'Blueberry Muffin', description: 'Soft muffin packed with fresh blueberries', price: 3.00, sku: 'BAK-MUF', cat: catIds.pastries },
];

for (const p of products) {
    // shop_products
    db.prepare(`
    INSERT OR IGNORE INTO shop_products 
    (id, tenant_id, name, sku, category_id, cost_price, retail_price, tax_rate, reorder_point, is_active, mobile_visible, mobile_price, mobile_description) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        p.id, tenantId, p.name, p.sku, p.cat, p.price * 0.5, p.price, 0, 10, 1, 1, p.price, p.description
    );
}

const pCount = db.prepare('SELECT COUNT(*) as c FROM shop_products WHERE tenant_id = ?').get(tenantId);
console.log(`Added test database items. Total products: ${pCount.c}`);

db.close();
