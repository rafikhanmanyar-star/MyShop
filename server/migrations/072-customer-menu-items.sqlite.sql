-- SQLite companion for 072-customer-menu-items.sql

CREATE TABLE IF NOT EXISTS customer_menu_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_menu_items_owner
    ON customer_menu_items (tenant_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_menu_item_ingredients (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_menu_item_id TEXT NOT NULL REFERENCES customer_menu_items(id) ON DELETE CASCADE,
    ingredient_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL DEFAULT '',
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT '',
    optional INTEGER NOT NULL DEFAULT 0,
    product_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_customer_menu_item_ingredients_item
    ON customer_menu_item_ingredients (customer_menu_item_id);

ALTER TABLE weekly_menu_items ADD COLUMN customer_menu_item_id TEXT;
ALTER TABLE menu_template_items ADD COLUMN customer_menu_item_id TEXT;
