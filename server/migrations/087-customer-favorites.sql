-- ============================================================================
-- MIGRATION 087: Customer product favorites (mobile)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_favorites (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_customer
    ON customer_favorites (tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_product
    ON customer_favorites (tenant_id, product_id);

ALTER TABLE customer_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON customer_favorites;
CREATE POLICY tenant_isolation ON customer_favorites FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
