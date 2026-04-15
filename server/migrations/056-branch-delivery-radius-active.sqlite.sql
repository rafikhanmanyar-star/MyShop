-- SQLite: branch delivery radius + active flag
ALTER TABLE shop_branches ADD COLUMN max_delivery_distance_km REAL;
ALTER TABLE shop_branches ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_shop_branches_tenant_active_geo ON shop_branches (tenant_id)
  WHERE COALESCE(is_active, 1) = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL;

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
    CASE WHEN COALESCE(is_active, 1) = 1 THEN 1 ELSE 0 END AS is_active
FROM shop_branches;
