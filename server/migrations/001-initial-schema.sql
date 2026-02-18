-- MyShop Database Schema
-- Multi-tenant architecture with Row Level Security
-- PostgreSQL

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TENANTS & USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company_name TEXT,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    login_status BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, username)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, tenant_id)
);

-- ============================================================================
-- 2. SHARED TABLES (contacts, categories)
-- ============================================================================

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    contact_no TEXT,
    company_name TEXT,
    address TEXT,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. SHOP & POS MODULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS shop_policies (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    allow_negative_stock BOOLEAN DEFAULT FALSE,
    universal_pricing BOOLEAN DEFAULT TRUE,
    tax_inclusive BOOLEAN DEFAULT FALSE,
    default_tax_rate DECIMAL(5, 2) DEFAULT 0,
    require_manager_approval BOOLEAN DEFAULT FALSE,
    loyalty_redemption_ratio DECIMAL(5, 4) DEFAULT 0.01,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_branches (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Flagship',
    status TEXT NOT NULL DEFAULT 'Active',
    location TEXT,
    region TEXT,
    manager_name TEXT,
    contact_no TEXT,
    timezone TEXT DEFAULT 'GMT+5',
    open_time TIME,
    close_time TIME,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shop_terminals (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES shop_branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Online',
    version TEXT,
    last_sync TIMESTAMP,
    ip_address TEXT,
    health_score INTEGER DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shop_warehouses (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    location TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shop_products (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    barcode TEXT,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    unit TEXT DEFAULT 'pcs',
    cost_price DECIMAL(15, 2) DEFAULT 0,
    retail_price DECIMAL(15, 2) DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    reorder_point INTEGER DEFAULT 10,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS shop_inventory (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
    warehouse_id TEXT NOT NULL REFERENCES shop_warehouses(id) ON DELETE CASCADE,
    quantity_on_hand DECIMAL(15, 2) DEFAULT 0,
    quantity_reserved DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS shop_loyalty_members (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    card_number TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'Silver',
    points_balance INTEGER DEFAULT 0,
    lifetime_points INTEGER DEFAULT 0,
    total_spend DECIMAL(15, 2) DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, card_number),
    UNIQUE(tenant_id, customer_id)
);

CREATE TABLE IF NOT EXISTS shop_sales (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES shop_branches(id),
    terminal_id TEXT REFERENCES shop_terminals(id),
    user_id TEXT REFERENCES users(id),
    customer_id TEXT REFERENCES contacts(id),
    loyalty_member_id TEXT REFERENCES shop_loyalty_members(id),
    sale_number TEXT NOT NULL,
    subtotal DECIMAL(15, 2) NOT NULL,
    tax_total DECIMAL(15, 2) NOT NULL,
    discount_total DECIMAL(15, 2) DEFAULT 0,
    grand_total DECIMAL(15, 2) NOT NULL,
    total_paid DECIMAL(15, 2) DEFAULT 0,
    change_due DECIMAL(15, 2) DEFAULT 0,
    payment_method TEXT NOT NULL,
    payment_details JSONB,
    status TEXT NOT NULL DEFAULT 'Completed',
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, sale_number)
);

CREATE TABLE IF NOT EXISTS shop_sale_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id TEXT NOT NULL REFERENCES shop_sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    quantity DECIMAL(15, 2) NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    subtotal DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_inventory_movements (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    warehouse_id TEXT NOT NULL REFERENCES shop_warehouses(id),
    type TEXT NOT NULL,
    quantity DECIMAL(15, 2) NOT NULL,
    reference_id TEXT,
    reason TEXT,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_branches_tenant ON shop_branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_products_tenant ON shop_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_products_sku ON shop_products(tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_shop_sales_tenant ON shop_sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_inventory_product ON shop_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_shop_loyalty_customer ON shop_loyalty_members(customer_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_tenant ON user_sessions(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS TEXT AS $$
    SELECT current_setting('app.current_tenant_id', TRUE);
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('tenants', 'schema_migrations')
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t.table_name AND column_name = 'tenant_id') THEN
            EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())', t.table_name);
        END IF;
    END LOOP;
END $$;
