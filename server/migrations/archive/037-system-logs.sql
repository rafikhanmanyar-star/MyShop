-- Centralized error logging (tenant-scoped for RLS)
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    payload JSONB,
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_created ON system_logs(tenant_id, created_at DESC);

ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON system_logs;
CREATE POLICY tenant_isolation ON system_logs FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Non-empty product names (shop_products already has UNIQUE(tenant_id, sku) from initial schema)
UPDATE shop_products SET name = '[Unnamed]' WHERE name IS NULL OR trim(name) = '';
ALTER TABLE shop_products ALTER COLUMN name SET NOT NULL;
