-- POS Settings
CREATE TABLE IF NOT EXISTS pos_settings (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    auto_print_receipt BOOLEAN NOT NULL DEFAULT TRUE,
    default_printer_name TEXT,
    receipt_copies INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_settings_tenant ON pos_settings(tenant_id);

DO $$
BEGIN
    EXECUTE 'ALTER TABLE pos_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON pos_settings';
    EXECUTE 'CREATE POLICY tenant_isolation ON pos_settings FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error setting RLS on pos_settings: %', SQLERRM;
END $$;
