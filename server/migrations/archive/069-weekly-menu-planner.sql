-- ============================================================================
-- MIGRATION 069: Weekly menu planner, shopping lists, menu templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_menus (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    week_start_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_weekly_menus_customer_week ON weekly_menus (customer_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_menus_tenant_customer ON weekly_menus (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_weekly_menus_week ON weekly_menus (week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_menus_not_deleted ON weekly_menus (customer_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS weekly_menu_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    weekly_menu_id TEXT NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
    custom_meal_name TEXT,
    servings NUMERIC(10, 2) NOT NULL DEFAULT 1,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT weekly_menu_items_recipe_or_custom CHECK (
        recipe_id IS NOT NULL OR (custom_meal_name IS NOT NULL AND TRIM(custom_meal_name) <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_menu ON weekly_menu_items (weekly_menu_id);
CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_recipe ON weekly_menu_items (recipe_id);

CREATE TABLE IF NOT EXISTS shopping_lists (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    weekly_menu_id TEXT NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
    generated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_menu ON shopping_lists (weekly_menu_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_customer ON shopping_lists (customer_id);

CREATE TABLE IF NOT EXISTS shopping_list_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    ingredient_id TEXT,
    ingredient_name TEXT NOT NULL,
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT '',
    matched_product_id TEXT REFERENCES shop_products(id) ON DELETE SET NULL,
    category TEXT,
    added_to_cart BOOLEAN NOT NULL DEFAULT FALSE,
    is_checked BOOLEAN NOT NULL DEFAULT FALSE,
    is_at_home BOOLEAN NOT NULL DEFAULT FALSE,
    source_recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items (shopping_list_id);

CREATE TABLE IF NOT EXISTS menu_templates (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT REFERENCES mobile_customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_templates_customer ON menu_templates (customer_id);
CREATE INDEX IF NOT EXISTS idx_menu_templates_visibility ON menu_templates (tenant_id, visibility);

CREATE TABLE IF NOT EXISTS menu_template_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    template_id TEXT NOT NULL REFERENCES menu_templates(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
    custom_meal_name TEXT,
    servings NUMERIC(10, 2) NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT menu_template_items_recipe_or_custom CHECK (
        recipe_id IS NOT NULL OR (custom_meal_name IS NOT NULL AND TRIM(custom_meal_name) <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_menu_template_items_template ON menu_template_items (template_id);

CREATE TABLE IF NOT EXISTS menu_planner_events (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_planner_events_customer ON menu_planner_events (customer_id, created_at DESC);

-- Row level security
ALTER TABLE weekly_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_planner_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'weekly_menus',
        'weekly_menu_items',
        'shopping_lists',
        'menu_templates',
        'menu_planner_events'
    ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())',
            tbl
        );
    END LOOP;
END $$;

-- shopping_list_items: inherit tenant via shopping_list join; use policy on shopping_lists ownership
DROP POLICY IF EXISTS tenant_isolation ON shopping_list_items;
CREATE POLICY tenant_isolation ON shopping_list_items FOR ALL USING (
    EXISTS (
        SELECT 1 FROM shopping_lists sl
        WHERE sl.id = shopping_list_items.shopping_list_id
          AND sl.tenant_id = get_current_tenant_id()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM shopping_lists sl
        WHERE sl.id = shopping_list_items.shopping_list_id
          AND sl.tenant_id = get_current_tenant_id()
    )
);

DROP POLICY IF EXISTS tenant_isolation ON menu_template_items;
CREATE POLICY tenant_isolation ON menu_template_items FOR ALL USING (
    EXISTS (
        SELECT 1 FROM menu_templates mt
        WHERE mt.id = menu_template_items.template_id
          AND mt.tenant_id = get_current_tenant_id()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM menu_templates mt
        WHERE mt.id = menu_template_items.template_id
          AND mt.tenant_id = get_current_tenant_id()
    )
);
