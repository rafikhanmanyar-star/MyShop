-- SQLite companion for 068-recipes.sql (dev / local SQLite DB)

CREATE TABLE IF NOT EXISTS recipe_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    video_url TEXT,
    prep_time_minutes INTEGER NOT NULL DEFAULT 0,
    cook_time_minutes INTEGER NOT NULL DEFAULT 0,
    servings INTEGER NOT NULL DEFAULT 1,
    difficulty TEXT,
    cuisine TEXT,
    calories INTEGER,
    category_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_quick_meal INTEGER NOT NULL DEFAULT 0,
    is_budget_meal INTEGER NOT NULL DEFAULT 0,
    is_trending INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_tenant_title_lower ON recipes (tenant_id, title);

CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_recipes_active ON recipes (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    ingredient_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL DEFAULT '',
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT '',
    optional INTEGER NOT NULL DEFAULT 0,
    product_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product ON recipe_ingredients (product_id);

CREATE TABLE IF NOT EXISTS recipe_steps (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    instruction TEXT NOT NULL,
    image_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON recipe_steps (recipe_id);

CREATE TABLE IF NOT EXISTS user_saved_recipes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_recipes_user ON user_saved_recipes (tenant_id, user_id);
