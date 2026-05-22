-- POS Receipt Settings (tenant-scoped, for configurable receipt template)
CREATE TABLE IF NOT EXISTS pos_receipt_settings (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    show_logo BOOLEAN NOT NULL DEFAULT FALSE,
    show_barcode BOOLEAN NOT NULL DEFAULT TRUE,
    barcode_type TEXT NOT NULL DEFAULT 'CODE128' CHECK (barcode_type IN ('CODE128', 'CODE39', 'EAN13')),
    barcode_position TEXT NOT NULL DEFAULT 'footer' CHECK (barcode_position IN ('header', 'footer')),
    receipt_width TEXT NOT NULL DEFAULT '80mm' CHECK (receipt_width IN ('58mm', '80mm')),
    show_tax_breakdown BOOLEAN NOT NULL DEFAULT FALSE,
    show_cashier_name BOOLEAN NOT NULL DEFAULT TRUE,
    show_shift_number BOOLEAN NOT NULL DEFAULT TRUE,
    footer_message TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_receipt_settings_tenant ON pos_receipt_settings(tenant_id);

-- Sales: barcode value, reprint count, printed timestamp
ALTER TABLE shop_sales ADD COLUMN IF NOT EXISTS barcode_value TEXT;
ALTER TABLE shop_sales ADD COLUMN IF NOT EXISTS reprint_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shop_sales ADD COLUMN IF NOT EXISTS printed_at TIMESTAMP;

-- Print log (optional traceability)
CREATE TABLE IF NOT EXISTS print_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id TEXT NOT NULL REFERENCES shop_sales(id) ON DELETE CASCADE,
    printed_by TEXT,
    printer_name TEXT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    printed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_logs_sale ON print_logs(sale_id);

DO $$
BEGIN
    EXECUTE 'ALTER TABLE pos_receipt_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON pos_receipt_settings';
    EXECUTE 'CREATE POLICY tenant_isolation ON pos_receipt_settings FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error setting RLS on pos_receipt_settings: %', SQLERRM;
END $$;
