-- ============================================================================
-- MIGRATION 079: Voice-based ordering
-- ============================================================================

CREATE TABLE IF NOT EXISTS voice_order_settings (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT FALSE,
    max_recording_seconds INTEGER DEFAULT 120,
    max_upload_bytes INTEGER DEFAULT 10485760,
    transcription_enabled BOOLEAN DEFAULT FALSE,
    transcription_provider TEXT DEFAULT 'none',
    transcription_api_key TEXT,
    push_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_orders (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES shop_branches(id),
    audio_url TEXT,
    audio_duration_seconds DECIMAL(10, 2),
    audio_mime_type TEXT,
    transcription_text TEXT,
    transcription_items_json TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    notes TEXT,
    delivery_mode TEXT DEFAULT 'delivery',
    delivery_address TEXT,
    delivery_lat DECIMAL(10, 7),
    delivery_lng DECIMAL(10, 7),
    created_invoice_id TEXT REFERENCES shop_sales(id) ON DELETE SET NULL,
    mobile_order_id TEXT REFERENCES mobile_orders(id) ON DELETE SET NULL,
    customer_approved_at TIMESTAMP,
    received_at TIMESTAMP,
    invoice_created_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_voice_orders_tenant ON voice_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_orders_customer ON voice_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_voice_orders_status ON voice_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_voice_orders_created ON voice_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_orders_branch ON voice_orders(tenant_id, branch_id, status);

CREATE TABLE IF NOT EXISTS voice_order_status_history (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    voice_order_id TEXT NOT NULL REFERENCES voice_orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by TEXT,
    changed_by_type TEXT DEFAULT 'system',
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_order_status_history_order
    ON voice_order_status_history(voice_order_id);

ALTER TABLE voice_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_order_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_order_status_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'voice_orders',
        'voice_order_settings',
        'voice_order_status_history'
    ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())',
            tbl
        );
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION notify_new_voice_order()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'new_voice_order',
        json_build_object(
            'voiceOrderId', NEW.id,
            'tenantId', NEW.tenant_id,
            'orderNumber', NEW.order_number,
            'status', NEW.status,
            'customerId', NEW.customer_id,
            'branchId', NEW.branch_id,
            'createdAt', NEW.created_at
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_new_voice_order ON voice_orders;
CREATE TRIGGER trg_new_voice_order
    AFTER INSERT ON voice_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_voice_order();

CREATE OR REPLACE FUNCTION notify_voice_order_updated()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.created_invoice_id IS DISTINCT FROM NEW.created_invoice_id
       OR OLD.mobile_order_id IS DISTINCT FROM NEW.mobile_order_id
       OR OLD.transcription_text IS DISTINCT FROM NEW.transcription_text THEN
        PERFORM pg_notify(
            'voice_order_updated',
            json_build_object(
                'voiceOrderId', NEW.id,
                'tenantId', NEW.tenant_id,
                'orderNumber', NEW.order_number,
                'status', NEW.status,
                'customerId', NEW.customer_id,
                'createdInvoiceId', NEW.created_invoice_id,
                'mobileOrderId', NEW.mobile_order_id,
                'updatedAt', NEW.updated_at
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voice_order_updated ON voice_orders;
CREATE TRIGGER trg_voice_order_updated
    AFTER UPDATE ON voice_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_voice_order_updated();
