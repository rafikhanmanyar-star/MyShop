-- ============================================================================
-- MIGRATION 007: Monthly Grocery Budget Feature
-- ============================================================================

-- 1. BUDGETS TABLE
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT REFERENCES mobile_customers(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL, -- For POS users/admins if needed
    month INTEGER NOT NULL, -- 1-12
    year INTEGER NOT NULL,
    total_budget_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    budget_type TEXT NOT NULL DEFAULT 'Flexible', -- 'Fixed' or 'Flexible'
    status TEXT NOT NULL DEFAULT 'active', -- 'active' or 'closed'
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, customer_id, month, year)
);

-- 2. BUDGET ITEMS TABLE
CREATE TABLE IF NOT EXISTS budget_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
    planned_quantity DECIMAL(15, 2) NOT NULL DEFAULT 1,
    planned_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    planned_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    actual_quantity DECIMAL(15, 2) NOT NULL DEFAULT 0,
    actual_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(budget_id, product_id)
);

-- 3. BUDGET VS ACTUAL VIEW
CREATE OR REPLACE VIEW budget_vs_actual_view AS
SELECT 
    bi.id as budget_item_id,
    bi.budget_id,
    bi.tenant_id,
    bi.product_id,
    p.name as product_name,
    p.sku as product_sku,
    bi.planned_quantity,
    bi.actual_quantity,
    bi.planned_price,
    bi.planned_total,
    bi.actual_amount,
    (bi.planned_total - bi.actual_amount) as variance_amount,
    CASE 
        WHEN bi.planned_total = 0 THEN 0
        ELSE ((bi.actual_amount - bi.planned_total) / bi.planned_total) * 100 
    END as variance_percentage
FROM budget_items bi
JOIN shop_products p ON bi.product_id = p.id;

-- 4. ENABLE RLS
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY['budgets', 'budget_items'])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())',
            tbl
        );
    END LOOP;
END $$;

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_customer ON budgets(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_budget ON budget_items(budget_id);
