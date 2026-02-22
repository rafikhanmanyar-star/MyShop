-- ============================================================================
-- MIGRATION 008: Budget Intelligence & Forecast Engine
-- ============================================================================

-- 1. FORECAST RUNS TABLE
CREATE TABLE IF NOT EXISTS forecast_runs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    forecast_month INTEGER NOT NULL,
    forecast_year INTEGER NOT NULL,
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    confidence_score DECIMAL(5, 2) DEFAULT 0,
    total_projected_revenue DECIMAL(15, 2) DEFAULT 0,
    total_projected_profit DECIMAL(15, 2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active',
    UNIQUE(tenant_id, forecast_month, forecast_year)
);

-- 2. PRODUCT FORECASTS TABLE
CREATE TABLE IF NOT EXISTS product_forecasts (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    forecast_id TEXT NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
    forecast_quantity DECIMAL(15, 2) NOT NULL DEFAULT 0,
    forecast_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    forecast_profit DECIMAL(15, 2) NOT NULL DEFAULT 0,
    historical_avg_quantity DECIMAL(15, 2) DEFAULT 0,
    planned_quantity DECIMAL(15, 2) DEFAULT 0,
    stock_risk_level TEXT DEFAULT 'Normal', -- 'Stock-Out', 'Overstock', 'Normal'
    stock_out_risk_percent DECIMAL(5, 2) DEFAULT 0,
    overstock_risk_percent DECIMAL(5, 2) DEFAULT 0,
    reorder_recommendation DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(forecast_id, product_id)
);

-- 3. CATEGORY FORECASTS TABLE
CREATE TABLE IF NOT EXISTS category_forecasts (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    forecast_id TEXT NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    forecast_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    forecast_profit DECIMAL(15, 2) NOT NULL DEFAULT 0,
    demand_growth_percent DECIMAL(5, 2) DEFAULT 0,
    UNIQUE(forecast_id, category_id)
);

-- 4. CASH FLOW FORECASTS TABLE
CREATE TABLE IF NOT EXISTS cash_flow_forecasts (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    forecast_id TEXT NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    projected_inflow DECIMAL(15, 2) DEFAULT 0,
    projected_outflow DECIMAL(15, 2) DEFAULT 0,
    working_capital_requirement DECIMAL(15, 2) DEFAULT 0,
    liquidity_risk_level TEXT DEFAULT 'Low', -- 'Low', 'Medium', 'High'
    UNIQUE(forecast_id)
);

-- 5. ENABLE RLS
ALTER TABLE forecast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flow_forecasts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY['forecast_runs', 'product_forecasts', 'category_forecasts', 'cash_flow_forecasts'])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())',
            tbl
        );
    END LOOP;
END $$;

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_forecast_runs_tenant ON forecast_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_forecasts_forecast ON product_forecasts(forecast_id);
CREATE INDEX IF NOT EXISTS idx_category_forecasts_forecast ON category_forecasts(forecast_id);
