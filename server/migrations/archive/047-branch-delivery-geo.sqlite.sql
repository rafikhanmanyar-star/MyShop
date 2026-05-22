-- SQLite variant: branch geo columns + branches view (Stage 2)

ALTER TABLE shop_branches ADD COLUMN latitude NUMERIC;
ALTER TABLE shop_branches ADD COLUMN longitude NUMERIC;
ALTER TABLE shop_branches ADD COLUMN address TEXT;

UPDATE shop_branches
SET address = NULLIF(TRIM(location), '')
WHERE (address IS NULL OR TRIM(address) = '')
  AND location IS NOT NULL
  AND TRIM(location) != '';

CREATE INDEX IF NOT EXISTS idx_shop_branches_tenant_geo ON shop_branches (tenant_id)
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
