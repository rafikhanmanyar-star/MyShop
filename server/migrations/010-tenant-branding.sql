CREATE TABLE IF NOT EXISTS tenant_branding (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    logo_url TEXT,
    logo_dark_url TEXT,
    primary_color TEXT DEFAULT '#3b82f6',
    secondary_color TEXT DEFAULT '#10b981',
    accent_color TEXT DEFAULT '#f59e0b',
    font_family TEXT DEFAULT 'system-ui',
    theme_mode TEXT DEFAULT 'light',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Enable RLS for this table
ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;

-- Add tenant isolation policy
DROP POLICY IF EXISTS tenant_isolation ON tenant_branding;
CREATE POLICY tenant_isolation ON tenant_branding FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
