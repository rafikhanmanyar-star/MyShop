-- ============================================================================
-- MIGRATION 056: Per-branch delivery radius + active flag (POS branch config)
-- ============================================================================

ALTER TABLE shop_branches
    ADD COLUMN IF NOT EXISTS max_delivery_distance_km DECIMAL(8, 2),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN shop_branches.max_delivery_distance_km IS 'Max Haversine distance (km) from customer to this branch for delivery; NULL uses tenant mobile_ordering_settings.max_delivery_radius_km';
COMMENT ON COLUMN shop_branches.is_active IS 'When FALSE, branch is excluded from automatic delivery routing';

CREATE INDEX IF NOT EXISTS idx_shop_branches_tenant_active_geo
    ON shop_branches (tenant_id)
    WHERE COALESCE(is_active, TRUE) = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL;

DROP VIEW IF EXISTS branches;
CREATE VIEW branches AS
SELECT
    id,
    tenant_id,
    name,
    latitude,
    longitude,
    COALESCE(NULLIF(TRIM(address), ''), NULLIF(TRIM(location), '')) AS address,
    max_delivery_distance_km,
    is_active
FROM shop_branches;
