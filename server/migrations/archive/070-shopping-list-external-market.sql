-- ============================================================================
-- MIGRATION 070: External market / inventory availability on shopping list items
-- ============================================================================

ALTER TABLE shopping_list_items
    ADD COLUMN IF NOT EXISTS availability_type TEXT NOT NULL DEFAULT 'external_market'
        CHECK (availability_type IN ('in_shop', 'external_market'));

ALTER TABLE shopping_list_items
    ADD COLUMN IF NOT EXISTS product_match_status TEXT NOT NULL DEFAULT 'not_found'
        CHECK (product_match_status IN ('matched', 'partial_match', 'not_found'));

ALTER TABLE shopping_list_items
    ADD COLUMN IF NOT EXISTS suggested_product_id TEXT REFERENCES shop_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_availability
    ON shopping_list_items (shopping_list_id, availability_type);

-- Backfill: rows that already have a matched catalog product
UPDATE shopping_list_items
SET
    availability_type = 'in_shop',
    product_match_status = 'matched'
WHERE matched_product_id IS NOT NULL;

UPDATE shopping_list_items
SET
    availability_type = 'external_market',
    product_match_status = 'not_found'
WHERE matched_product_id IS NULL;

-- Inventory gap analytics for future admin dashboards
CREATE TABLE IF NOT EXISTS menu_planner_inventory_gaps (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    shopping_list_id TEXT REFERENCES shopping_lists(id) ON DELETE SET NULL,
    ingredient_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL DEFAULT '',
    quantity NUMERIC(15, 4),
    unit TEXT NOT NULL DEFAULT '',
    product_match_status TEXT NOT NULL DEFAULT 'not_found',
    suggested_product_id TEXT REFERENCES shop_products(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_gaps_tenant_norm ON menu_planner_inventory_gaps (tenant_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_inventory_gaps_tenant_created ON menu_planner_inventory_gaps (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_gaps_list ON menu_planner_inventory_gaps (shopping_list_id);

ALTER TABLE menu_planner_inventory_gaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON menu_planner_inventory_gaps;
CREATE POLICY tenant_isolation ON menu_planner_inventory_gaps FOR ALL USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
