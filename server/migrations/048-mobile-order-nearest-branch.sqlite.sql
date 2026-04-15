-- SQLite: nearest-branch columns on mobile_orders

ALTER TABLE mobile_orders ADD COLUMN assigned_branch_id TEXT REFERENCES shop_branches(id);
ALTER TABLE mobile_orders ADD COLUMN distance_km NUMERIC;

CREATE INDEX IF NOT EXISTS idx_mobile_orders_assigned_branch ON mobile_orders (tenant_id, assigned_branch_id)
    WHERE assigned_branch_id IS NOT NULL;
