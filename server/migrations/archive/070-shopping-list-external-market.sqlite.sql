-- SQLite companion for 070-shopping-list-external-market.sql

ALTER TABLE shopping_list_items ADD COLUMN availability_type TEXT NOT NULL DEFAULT 'external_market';
ALTER TABLE shopping_list_items ADD COLUMN product_match_status TEXT NOT NULL DEFAULT 'not_found';
ALTER TABLE shopping_list_items ADD COLUMN suggested_product_id TEXT;

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_availability ON shopping_list_items (shopping_list_id, availability_type);

CREATE TABLE IF NOT EXISTS menu_planner_inventory_gaps (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    shopping_list_id TEXT NOT NULL,
    ingredient_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL DEFAULT '',
    quantity NUMERIC,
    unit TEXT NOT NULL DEFAULT '',
    product_match_status TEXT NOT NULL DEFAULT 'not_found',
    suggested_product_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_gaps_tenant_norm ON menu_planner_inventory_gaps (tenant_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_inventory_gaps_list ON menu_planner_inventory_gaps (shopping_list_id);
