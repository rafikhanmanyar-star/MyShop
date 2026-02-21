const Database = require('better-sqlite3');
const db = new Database('./myshop.db');

console.log('=== SHOP_PRODUCTS TABLE ===');
const prodCount = db.prepare('SELECT COUNT(*) as total FROM shop_products').get();
console.log('Total products:', prodCount.total);

if (prodCount.total > 0) {
    const cols = db.pragma('table_info(shop_products)');
    console.log('Columns:', cols.map(c => c.name).join(', '));

    const sample = db.prepare('SELECT * FROM shop_products LIMIT 2').all();
    console.log('Sample:', JSON.stringify(sample, null, 2));
} else {
    console.log('>>> shop_products table is EMPTY!');
}

console.log('\n=== SHOP_INVENTORY TABLE ===');
const invCount = db.prepare('SELECT COUNT(*) as total FROM shop_inventory').get();
console.log('Total inventory items:', invCount.total);
if (invCount.total > 0) {
    const cols = db.pragma('table_info(shop_inventory)');
    console.log('Columns:', cols.map(c => c.name).join(', '));

    const sample = db.prepare('SELECT * FROM shop_inventory LIMIT 2').all();
    console.log('Sample:', JSON.stringify(sample, null, 2));
}

console.log('\n=== CATEGORIES TABLE ===');
const catCount = db.prepare('SELECT COUNT(*) as total FROM categories').get();
console.log('Total categories:', catCount.total);
if (catCount.total > 0) {
    const sample = db.prepare('SELECT * FROM categories LIMIT 2').all();
    console.log('Sample:', JSON.stringify(sample, null, 2));
}

console.log('\n=== USER TENANT IDS ===');
const users = db.prepare('SELECT id, username, tenant_id, role FROM users LIMIT 5').all();
console.log(JSON.stringify(users, null, 2));

db.close();
