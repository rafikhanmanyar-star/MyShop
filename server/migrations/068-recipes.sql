-- ============================================================================
-- MIGRATION 068: Recipe catalog (POS config + mobile discovery & cart bridge)
-- ============================================================================

CREATE TABLE IF NOT EXISTS recipe_categories (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
    category_id TEXT REFERENCES recipe_categories(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_quick_meal BOOLEAN NOT NULL DEFAULT FALSE,
    is_budget_meal BOOLEAN NOT NULL DEFAULT FALSE,
    is_trending BOOLEAN NOT NULL DEFAULT FALSE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_tenant_title_lower
    ON recipes (tenant_id, LOWER(TRIM(title)));

CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes (tenant_id, title);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_recipes_active ON recipes (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_recipes_featured ON recipes (tenant_id, is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_recipes_trending ON recipes (tenant_id, is_trending) WHERE is_trending = TRUE;

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL DEFAULT '',
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT '',
    optional BOOLEAN NOT NULL DEFAULT FALSE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product ON recipe_ingredients (product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_norm ON recipe_ingredients (tenant_id, normalized_name);

CREATE TABLE IF NOT EXISTS recipe_steps (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    instruction TEXT NOT NULL,
    image_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON recipe_steps (recipe_id);

CREATE TABLE IF NOT EXISTS user_saved_recipes (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_recipes_user ON user_saved_recipes (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_recipes_recipe ON user_saved_recipes (recipe_id);

-- Row level security
ALTER TABLE recipe_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_recipes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY['recipe_categories', 'recipes', 'recipe_ingredients', 'recipe_steps', 'user_saved_recipes'])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())',
            tbl
        );
    END LOOP;
END $$;
