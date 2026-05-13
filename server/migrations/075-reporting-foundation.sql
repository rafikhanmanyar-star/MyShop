-- Enterprise reporting module: saved reports, templates, schedules, exports, widgets, filter presets.
-- PostgreSQL. Companion: 075-reporting-foundation.sqlite.sql

-- ---------------------------------------------------------------------------
-- Core catalog / persistence
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS saved_reports (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category_slug TEXT NOT NULL,
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant ON saved_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant_user ON saved_reports(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_category ON saved_reports(tenant_id, category_slug);

CREATE TABLE IF NOT EXISTS report_templates (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    module_key TEXT NOT NULL,
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_tenant ON report_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_module ON report_templates(tenant_id, module_key);

CREATE TABLE IF NOT EXISTS report_schedules (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT REFERENCES report_templates(id) ON DELETE SET NULL,
    saved_report_id TEXT REFERENCES saved_reports(id) ON DELETE SET NULL,
    cron_expression TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    export_format TEXT NOT NULL DEFAULT 'pdf',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant ON report_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next ON report_schedules(tenant_id, is_active, next_run_at);

CREATE TABLE IF NOT EXISTS report_exports (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    saved_report_id TEXT REFERENCES saved_reports(id) ON DELETE SET NULL,
    format TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    file_path TEXT,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_exports_tenant ON report_exports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_exports_status ON report_exports(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    layout JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS report_filter_presets (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_filter_presets_tenant_user ON report_filter_presets(tenant_id, user_id);

-- ---------------------------------------------------------------------------
-- Optional aggregation layer (refresh via cron / job; not auto-refreshed here)
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_report_daily_sales_by_branch AS
SELECT
    s.tenant_id,
    COALESCE(s.branch_id, '') AS branch_id,
    (s.created_at AT TIME ZONE 'UTC')::date AS sale_day,
    COUNT(*)::bigint AS transaction_count,
    COALESCE(SUM(s.grand_total), 0)::numeric(18, 2) AS gross_revenue,
    COALESCE(SUM(s.discount_total), 0)::numeric(18, 2) AS discount_total,
    COALESCE(SUM(s.tax_total), 0)::numeric(18, 2) AS tax_total
FROM shop_sales s
WHERE s.status = 'Completed'
GROUP BY s.tenant_id, COALESCE(s.branch_id, ''), (s.created_at AT TIME ZONE 'UTC')::date;

CREATE UNIQUE INDEX IF NOT EXISTS mv_report_daily_sales_by_branch_uid
    ON mv_report_daily_sales_by_branch (tenant_id, branch_id, sale_day);

COMMENT ON MATERIALIZED VIEW mv_report_daily_sales_by_branch IS
    'Pre-aggregated POS sales for reporting; REFRESH MATERIALIZED VIEW CONCURRENTLY mv_report_daily_sales_by_branch; after bulk loads.';
