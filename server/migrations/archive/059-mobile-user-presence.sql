-- ============================================================================
-- MIGRATION 059: Mobile User Presence / Heartbeat Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS mobile_customer_heartbeats (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    current_page TEXT,
    cart_item_count INTEGER DEFAULT 0,
    cart_total DECIMAL(15, 2) DEFAULT 0,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_mobile_heartbeats_tenant_lastseen
    ON mobile_customer_heartbeats(tenant_id, last_seen_at DESC);

ALTER TABLE mobile_customer_heartbeats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON mobile_customer_heartbeats';
    EXECUTE 'CREATE POLICY tenant_isolation ON mobile_customer_heartbeats FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())';
END $$;

CREATE OR REPLACE FUNCTION notify_mobile_user_activity()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'mobile_user_activity',
        json_build_object(
            'tenantId', NEW.tenant_id,
            'customerId', NEW.customer_id,
            'lastSeenAt', NEW.last_seen_at,
            'currentPage', NEW.current_page,
            'cartItemCount', NEW.cart_item_count,
            'cartTotal', NEW.cart_total
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mobile_user_activity ON mobile_customer_heartbeats;
CREATE TRIGGER trg_mobile_user_activity
    AFTER INSERT OR UPDATE ON mobile_customer_heartbeats
    FOR EACH ROW
    EXECUTE FUNCTION notify_mobile_user_activity();
