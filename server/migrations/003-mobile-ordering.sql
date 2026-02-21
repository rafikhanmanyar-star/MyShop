-- ============================================================================
-- MIGRATION 003: Mobile Ordering System
-- ============================================================================

-- 1. TENANT BRANDING / SLUG (for QR code → URL → shop discovery)
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#4F46E5';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- 2. PRODUCT MOBILE VISIBILITY COLUMNS
ALTER TABLE shop_products
    ADD COLUMN IF NOT EXISTS mobile_visible BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS mobile_price DECIMAL(15, 2),
    ADD COLUMN IF NOT EXISTS mobile_description TEXT,
    ADD COLUMN IF NOT EXISTS mobile_sort_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_shop_products_mobile
    ON shop_products(tenant_id, mobile_visible) WHERE mobile_visible = TRUE;

-- 3. MOBILE CUSTOMERS
CREATE TABLE IF NOT EXISTS mobile_customers (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
    otp_expires_at TIMESTAMP,
    is_verified BOOLEAN DEFAULT FALSE,
    is_blocked BOOLEAN DEFAULT FALSE,
    device_token TEXT,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_mobile_customers_tenant_phone
    ON mobile_customers(tenant_id, phone);

-- 4. MOBILE ORDERS
CREATE TABLE IF NOT EXISTS mobile_orders (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id),
    branch_id TEXT REFERENCES shop_branches(id),
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
    estimated_delivery_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    cancelled_by TEXT,
    idempotency_key TEXT UNIQUE,
    pos_synced BOOLEAN DEFAULT FALSE,
    pos_synced_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_mobile_orders_tenant ON mobile_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mobile_orders_customer ON mobile_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_mobile_orders_status ON mobile_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mobile_orders_created ON mobile_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mobile_orders_pos_synced
    ON mobile_orders(tenant_id, pos_synced) WHERE pos_synced = FALSE;

-- 5. MOBILE ORDER ITEMS
CREATE TABLE IF NOT EXISTS mobile_order_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES mobile_orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    product_name TEXT NOT NULL,
    product_sku TEXT NOT NULL,
    quantity DECIMAL(15, 2) NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    subtotal DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_order_items_order ON mobile_order_items(order_id);

-- 6. ORDER STATUS HISTORY
CREATE TABLE IF NOT EXISTS mobile_order_status_history (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES mobile_orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by TEXT,
    changed_by_type TEXT DEFAULT 'system',
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_order_status_history_order
    ON mobile_order_status_history(order_id);

-- 7. MOBILE ORDERING SETTINGS (per-tenant)
CREATE TABLE IF NOT EXISTS mobile_ordering_settings (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT FALSE,
    minimum_order_amount DECIMAL(15, 2) DEFAULT 0,
    delivery_fee DECIMAL(15, 2) DEFAULT 0,
    free_delivery_above DECIMAL(15, 2),
    max_delivery_radius_km DECIMAL(5, 2),
    auto_confirm_orders BOOLEAN DEFAULT FALSE,
    order_acceptance_start TIME DEFAULT '09:00',
    order_acceptance_end TIME DEFAULT '21:00',
    estimated_delivery_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 8. ROW LEVEL SECURITY
ALTER TABLE mobile_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_ordering_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'mobile_customers',
        'mobile_orders',
        'mobile_order_items',
        'mobile_order_status_history',
        'mobile_ordering_settings'
    ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())',
            tbl
        );
    END LOOP;
END $$;

-- 9. NOTIFICATION FUNCTION (pg_notify on new order)
CREATE OR REPLACE FUNCTION notify_new_mobile_order()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'new_mobile_order',
        json_build_object(
            'orderId', NEW.id,
            'tenantId', NEW.tenant_id,
            'orderNumber', NEW.order_number,
            'grandTotal', NEW.grand_total,
            'status', NEW.status,
            'createdAt', NEW.created_at
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_new_mobile_order ON mobile_orders;
CREATE TRIGGER trg_new_mobile_order
    AFTER INSERT ON mobile_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_mobile_order();
