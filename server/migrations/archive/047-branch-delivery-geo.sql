-- ============================================================================
-- MIGRATION 047: Branch delivery / geo (Stage 2 — branch management for routing)
-- ============================================================================
-- Extends existing shop_branches (used by POS, mobile_orders, warehouses).
-- Spec "branches" table is exposed as VIEW branches(id, tenant_id, name, lat, lng, address).

ALTER TABLE shop_branches
    ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
    ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
    ADD COLUMN IF NOT EXISTS address TEXT;

-- Prefer structured address; fall back to legacy location text for existing rows
UPDATE shop_branches
SET address = NULLIF(TRIM(location), '')
WHERE (address IS NULL OR TRIM(address) = '')
  AND location IS NOT NULL
  AND TRIM(location) != '';

CREATE INDEX IF NOT EXISTS idx_shop_branches_tenant_geo
    ON shop_branches (tenant_id)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

DROP VIEW IF EXISTS branches;
CREATE VIEW branches AS
SELECT
    id,
    tenant_id,
    name,
    latitude,
    longitude,
    COALESCE(NULLIF(TRIM(address), ''), NULLIF(TRIM(location), '')) AS address
FROM shop_branches;

COMMENT ON COLUMN shop_branches.latitude IS 'Branch latitude for distance-based assignment (WGS84)';
COMMENT ON COLUMN shop_branches.longitude IS 'Branch longitude for distance-based assignment (WGS84)';
COMMENT ON COLUMN shop_branches.address IS 'Full street/delivery address for the branch (optional; may mirror location)';
