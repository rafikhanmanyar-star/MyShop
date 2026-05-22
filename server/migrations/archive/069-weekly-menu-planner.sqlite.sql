-- SQLite companion for 069-weekly-menu-planner.sql

CREATE TABLE IF NOT EXISTS weekly_menus (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    title TEXT NOT NULL,
    week_start_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_weekly_menus_customer_week ON weekly_menus (customer_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_menus_tenant_customer ON weekly_menus (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS weekly_menu_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    weekly_menu_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    meal_type TEXT NOT NULL,
    recipe_id TEXT,
    custom_meal_name TEXT,
    servings NUMERIC NOT NULL DEFAULT 1,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_menu ON weekly_menu_items (weekly_menu_id);
CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_recipe ON weekly_menu_items (recipe_id);

CREATE TABLE IF NOT EXISTS shopping_lists (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    weekly_menu_id TEXT NOT NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_menu ON shopping_lists (weekly_menu_id);

CREATE TABLE IF NOT EXISTS shopping_list_items (
    id TEXT PRIMARY KEY,
    shopping_list_id TEXT NOT NULL,
    ingredient_id TEXT,
    ingredient_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT '',
    matched_product_id TEXT,
    category TEXT,
    added_to_cart INTEGER NOT NULL DEFAULT 0,
    is_checked INTEGER NOT NULL DEFAULT 0,
    is_at_home INTEGER NOT NULL DEFAULT 0,
    source_recipe_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items (shopping_list_id);

CREATE TABLE IF NOT EXISTS menu_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT,
    name TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_menu_templates_tenant ON menu_templates (tenant_id, visibility);

CREATE TABLE IF NOT EXISTS menu_template_items (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    meal_type TEXT NOT NULL,
    recipe_id TEXT,
    custom_meal_name TEXT,
    servings NUMERIC NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_menu_template_items_template ON menu_template_items (template_id);

CREATE TABLE IF NOT EXISTS menu_planner_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
