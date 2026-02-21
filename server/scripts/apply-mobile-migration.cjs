// Script to apply mobile ordering migration to SQLite dev database
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../myshop.db');
console.log('Opening database:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // Temporarily off to allow creating tables with refs

// Check existing state
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
console.log('Existing tables:', tables.map(t => t.name).join(', '));

// Helper to safely add column
function addColumn(table, column, type) {
    try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        console.log(`✅ Added ${table}.${column}`);
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log(`⏭️  ${table}.${column} already exists`);
        } else {
            console.error(`❌ Error adding ${table}.${column}:`, e.message);
        }
    }
}

// 0. Create tenants table if it doesn't exist (SQLite dev)
const hasTenants = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'`).get();
if (!hasTenants) {
    console.log('📦 Creating tenants table for local dev...');
    db.exec(`CREATE TABLE tenants (
        id TEXT PRIMARY KEY,
        name TEXT,
        company_name TEXT,
        email TEXT,
        slug TEXT UNIQUE,
        logo_url TEXT,
        brand_color TEXT DEFAULT '#4F46E5',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    console.log('✅ tenants table created');

    // Find existing tenant IDs from users table
    const existingTenantIds = db.prepare('SELECT DISTINCT tenant_id FROM users WHERE tenant_id IS NOT NULL').all();
    if (existingTenantIds.length > 0) {
        for (const row of existingTenantIds) {
            const tid = row.tenant_id;
            // Try to get company info from the first admin user
            const adminUser = db.prepare('SELECT username, full_name FROM users WHERE tenant_id = ? LIMIT 1').get(tid);
            const companyName = (adminUser && adminUser.full_name) || 'MyShop';
            const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'myshop';

            db.prepare('INSERT INTO tenants (id, name, company_name, slug) VALUES (?, ?, ?, ?)').run(tid, companyName, companyName, slug);
            console.log(`✅ Created tenant: ${companyName} (${tid}) → slug: ${slug}`);
        }
    } else {
        // Create a default tenant
        db.prepare("INSERT INTO tenants (id, name, company_name, slug) VALUES ('default', 'MyShop', 'MyShop', 'myshop')").run();
        console.log('✅ Created default tenant: myshop');
    }
} else {
    console.log('⏭️  tenants table already exists');
    // Just add mobile columns if missing
    addColumn('tenants', 'slug', 'TEXT UNIQUE');
    addColumn('tenants', 'logo_url', 'TEXT');
    addColumn('tenants', 'brand_color', "TEXT DEFAULT '#4F46E5'");

    // Auto-generate slugs for tenants without one
    const tenantsWithoutSlug = db.prepare('SELECT id, company_name, name FROM tenants WHERE slug IS NULL').all();
    for (const t of tenantsWithoutSlug) {
        const slug = (t.company_name || t.name || 'shop').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
        db.prepare('UPDATE tenants SET slug = ? WHERE id = ?').run(slug, t.id);
        console.log(`✅ Set slug for "${t.company_name || t.name}": ${slug}`);
    }
}

// 2. Product mobile visibility
addColumn('shop_products', 'mobile_visible', 'BOOLEAN DEFAULT 1');
addColumn('shop_products', 'mobile_price', 'DECIMAL(15, 2)');
addColumn('shop_products', 'mobile_description', 'TEXT');
addColumn('shop_products', 'mobile_sort_order', 'INTEGER DEFAULT 0');

// 3. Mobile customers
db.exec(`CREATE TABLE IF NOT EXISTS mobile_customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    name TEXT,
    email TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    postal_code TEXT,
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    otp_code TEXT,
    otp_expires_at TEXT,
    is_verified BOOLEAN DEFAULT 0,
    is_blocked BOOLEAN DEFAULT 0,
    device_token TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, phone)
)`);
console.log('✅ mobile_customers table ready');

// 4. Mobile orders
db.exec(`CREATE TABLE IF NOT EXISTS mobile_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    branch_id TEXT,
    order_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    discount_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    delivery_fee DECIMAL(15, 2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'COD',
    payment_status TEXT DEFAULT 'Unpaid',
    delivery_address TEXT,
    delivery_lat DECIMAL(10, 7),
    delivery_lng DECIMAL(10, 7),
    delivery_notes TEXT,
    estimated_delivery_at TEXT,
    delivered_at TEXT,
    cancelled_at TEXT,
    cancellation_reason TEXT,
    cancelled_by TEXT,
    idempotency_key TEXT UNIQUE,
    pos_synced BOOLEAN DEFAULT 0,
    pos_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, order_number)
)`);
console.log('✅ mobile_orders table ready');

// 5. Mobile order items
db.exec(`CREATE TABLE IF NOT EXISTS mobile_order_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    product_sku TEXT NOT NULL,
    quantity DECIMAL(15, 2) NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    subtotal DECIMAL(15, 2) NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
)`);
console.log('✅ mobile_order_items table ready');

// 6. Status history
db.exec(`CREATE TABLE IF NOT EXISTS mobile_order_status_history (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by TEXT,
    changed_by_type TEXT DEFAULT 'system',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
console.log('✅ mobile_order_status_history table ready');

// 7. Mobile ordering settings — may already exist
const hasSettings = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='mobile_ordering_settings'`).get();
if (!hasSettings) {
    db.exec(`CREATE TABLE mobile_ordering_settings (
        tenant_id TEXT PRIMARY KEY,
        is_enabled BOOLEAN DEFAULT 0,
        minimum_order_amount DECIMAL(15, 2) DEFAULT 0,
        delivery_fee DECIMAL(15, 2) DEFAULT 0,
        free_delivery_above DECIMAL(15, 2),
        max_delivery_radius_km DECIMAL(5, 2),
        auto_confirm_orders BOOLEAN DEFAULT 0,
        order_acceptance_start TEXT DEFAULT '09:00',
        order_acceptance_end TEXT DEFAULT '21:00',
        estimated_delivery_minutes INTEGER DEFAULT 60,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    console.log('✅ mobile_ordering_settings table created');
} else {
    console.log('⏭️  mobile_ordering_settings table already exists');
}

// 8. Enable mobile ordering for all tenants (dev convenience)
const allTenants = db.prepare('SELECT id, slug, company_name FROM tenants').all();
for (const t of allTenants) {
    db.prepare(`INSERT OR REPLACE INTO mobile_ordering_settings (tenant_id, is_enabled) VALUES (?, 1)`).run(t.id);
    console.log(`✅ Mobile ordering enabled for: ${t.company_name} (${t.slug})`);
}

// Final state
db.pragma('foreign_keys = ON');
const finalTables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
console.log('\n📋 Final tables:', finalTables.map(t => t.name).join(', '));

console.log('\n🏪 Tenants:');
for (const t of allTenants) {
    console.log(`   /${t.slug} → ${t.company_name} (${t.id})`);
}

db.close();
console.log('\n✅ Migration complete! Try visiting: http://localhost:5175/' + (allTenants[0] ? allTenants[0].slug : 'myshop'));
