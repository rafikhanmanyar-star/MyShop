-- ============================================================================
-- MIGRATION 050: Delivery order assignment (Stage 5 — rider + mobile order link)
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_orders (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES mobile_orders(id) ON DELETE CASCADE,
    rider_id TEXT NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ASSIGNED'
        CHECK (status IN ('ASSIGNED', 'PICKED', 'ON_THE_WAY', 'DELIVERED')),
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    picked_at TIMESTAMP,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_tenant ON delivery_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider ON delivery_orders (tenant_id, rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders (tenant_id, status);

ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON delivery_orders;
CREATE POLICY tenant_isolation ON delivery_orders FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

COMMENT ON TABLE delivery_orders IS 'Links mobile_orders to riders; auto-assigned on place order (Stage 5)';
