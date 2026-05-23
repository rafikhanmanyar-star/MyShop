-- ============================================================================
-- MIGRATION 072: Customer-created menu items (library + planner + shopping list)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_menu_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_menu_items_owner
    ON customer_menu_items (tenant_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_menu_item_ingredients (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_menu_item_id TEXT NOT NULL REFERENCES customer_menu_items(id) ON DELETE CASCADE,
    ingredient_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL DEFAULT '',
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT '',
    optional BOOLEAN NOT NULL DEFAULT FALSE,
    product_id TEXT REFERENCES shop_products(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_customer_menu_item_ingredients_item
    ON customer_menu_item_ingredients (customer_menu_item_id);

ALTER TABLE weekly_menu_items DROP CONSTRAINT IF EXISTS weekly_menu_items_recipe_or_custom;

ALTER TABLE weekly_menu_items
    ADD COLUMN customer_menu_item_id TEXT REFERENCES customer_menu_items(id) ON DELETE RESTRICT;

ALTER TABLE weekly_menu_items ADD CONSTRAINT weekly_menu_items_meal_source CHECK (
    recipe_id IS NOT NULL
    OR (custom_meal_name IS NOT NULL AND TRIM(custom_meal_name) <> '')
    OR customer_menu_item_id IS NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_customer_item
    ON weekly_menu_items (customer_menu_item_id);

ALTER TABLE menu_template_items DROP CONSTRAINT IF EXISTS menu_template_items_recipe_or_custom;

ALTER TABLE menu_template_items
    ADD COLUMN customer_menu_item_id TEXT REFERENCES customer_menu_items(id) ON DELETE RESTRICT;

ALTER TABLE menu_template_items ADD CONSTRAINT menu_template_items_meal_source CHECK (
    recipe_id IS NOT NULL
    OR (custom_meal_name IS NOT NULL AND TRIM(custom_meal_name) <> '')
    OR customer_menu_item_id IS NOT NULL
);

ALTER TABLE customer_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_menu_item_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON customer_menu_items;
CREATE POLICY tenant_isolation ON customer_menu_items FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON customer_menu_item_ingredients;
CREATE POLICY tenant_isolation ON customer_menu_item_ingredients FOR ALL USING (
    EXISTS (
        SELECT 1 FROM customer_menu_items cmi
        WHERE cmi.id = customer_menu_item_ingredients.customer_menu_item_id
          AND cmi.tenant_id = get_current_tenant_id()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM customer_menu_items cmi
        WHERE cmi.id = customer_menu_item_ingredients.customer_menu_item_id
          AND cmi.tenant_id = get_current_tenant_id()
    )
);
