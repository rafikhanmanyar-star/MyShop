-- ============================================================================
-- MIGRATION 049: Riders (Stage 4 — delivery fleet model)
-- ============================================================================

CREATE TABLE IF NOT EXISTS riders (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    current_latitude DECIMAL(10, 7),
    current_longitude DECIMAL(10, 7),
    status TEXT NOT NULL DEFAULT 'OFFLINE'
        CHECK (status IN ('AVAILABLE', 'BUSY', 'OFFLINE')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_riders_tenant ON riders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_riders_tenant_status ON riders (tenant_id, status)
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_riders_tenant_available ON riders (tenant_id)
    WHERE is_active = TRUE AND status = 'AVAILABLE';

ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON riders;
CREATE POLICY tenant_isolation ON riders FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

COMMENT ON TABLE riders IS 'Delivery riders per tenant; location updated by rider app (Stage 7)';
COMMENT ON COLUMN riders.status IS 'AVAILABLE | BUSY | OFFLINE';
