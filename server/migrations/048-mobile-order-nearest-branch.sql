-- ============================================================================
-- MIGRATION 048: Nearest-branch routing (Stage 3 — Haversine assignment metadata)
-- ============================================================================

ALTER TABLE mobile_orders
    ADD COLUMN IF NOT EXISTS assigned_branch_id TEXT REFERENCES shop_branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS distance_km DECIMAL(12, 4);

COMMENT ON COLUMN mobile_orders.assigned_branch_id IS 'Branch chosen for geo routing (nearest fulfillable when auto-routing; else fulfillment branch)';
COMMENT ON COLUMN mobile_orders.distance_km IS 'Haversine distance (km) from customer delivery_lat/lng to assigned branch coordinates when available';

CREATE INDEX IF NOT EXISTS idx_mobile_orders_assigned_branch
    ON mobile_orders (tenant_id, assigned_branch_id)
    WHERE assigned_branch_id IS NOT NULL;
