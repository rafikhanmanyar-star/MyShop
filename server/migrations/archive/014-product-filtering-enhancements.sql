-- ============================================================================
-- MIGRATION 014: Product Selection & Filtering Enhancements
-- ============================================================================

-- 1. Category Hierarchy (Subcategories)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- 2. Product Brands
CREATE TABLE IF NOT EXISTS shop_brands (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_shop_brands_tenant ON shop_brands(tenant_id);

-- 3. Enhance Shop Products
ALTER TABLE shop_products
    ADD COLUMN IF NOT EXISTS brand_id TEXT REFERENCES shop_brands(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS subcategory_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rating_avg DECIMAL(3,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS popularity_score INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_sales INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_on_sale BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_pre_order BOOLEAN DEFAULT FALSE;

-- 4. Indexes for Filtering performance
CREATE INDEX IF NOT EXISTS idx_products_filter_price ON shop_products(tenant_id, mobile_price) WHERE mobile_visible = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_filter_category ON shop_products(tenant_id, category_id) WHERE mobile_visible = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_filter_subcategory ON shop_products(tenant_id, subcategory_id) WHERE mobile_visible = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_filter_brand ON shop_products(tenant_id, brand_id) WHERE mobile_visible = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_filter_sale ON shop_products(tenant_id, is_on_sale) WHERE is_on_sale = TRUE;

-- 5. Row Level Security for Brands
ALTER TABLE shop_brands ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_brands' AND policyname = 'tenant_isolation') THEN
        CREATE POLICY tenant_isolation ON shop_brands FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;
END $$;
