-- ============================================================================
-- MIGRATION 082: Unified Order Center — schema extensions
-- ============================================================================

-- Mobile orders: source tracking + voice conversion link
ALTER TABLE mobile_orders
    ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'cart',
    ADD COLUMN IF NOT EXISTS source_reference_id TEXT,
    ADD COLUMN IF NOT EXISTS converted_from_voice_order_id TEXT REFERENCES voice_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mobile_orders_order_source
    ON mobile_orders(tenant_id, order_source, status);

CREATE INDEX IF NOT EXISTS idx_mobile_orders_voice_link
    ON mobile_orders(converted_from_voice_order_id)
    WHERE converted_from_voice_order_id IS NOT NULL;

-- Voice orders: cancellation metadata + unified source fields
ALTER TABLE voice_orders
    ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'voice',
    ADD COLUMN IF NOT EXISTS source_reference_id TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_note TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_voice_orders_cancelled
    ON voice_orders(tenant_id, cancelled_at DESC)
    WHERE status = 'Cancelled';

-- Unified order center SSE channel (optional fan-in from existing triggers)
CREATE OR REPLACE FUNCTION notify_order_center_event()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
    channel TEXT;
BEGIN
    IF TG_TABLE_NAME = 'mobile_orders' THEN
        channel := 'order_center_updated';
        payload := json_build_object(
            'kind', 'cart',
            'orderId', NEW.id,
            'tenantId', NEW.tenant_id,
            'orderNumber', NEW.order_number,
            'status', NEW.status,
            'orderSource', COALESCE(NEW.order_source, 'cart'),
            'updatedAt', NEW.updated_at
        );
    ELSIF TG_TABLE_NAME = 'voice_orders' THEN
        channel := 'order_center_updated';
        payload := json_build_object(
            'kind', 'voice',
            'orderId', NEW.id,
            'tenantId', NEW.tenant_id,
            'orderNumber', NEW.order_number,
            'status', NEW.status,
            'orderSource', COALESCE(NEW.order_source, 'voice'),
            'updatedAt', NEW.updated_at
        );
    ELSE
        RETURN NEW;
    END IF;
    PERFORM pg_notify(channel, payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_center_mobile ON mobile_orders;
CREATE TRIGGER trg_order_center_mobile
    AFTER INSERT OR UPDATE ON mobile_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_order_center_event();

DROP TRIGGER IF EXISTS trg_order_center_voice ON voice_orders;
CREATE TRIGGER trg_order_center_voice
    AFTER INSERT OR UPDATE ON voice_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_order_center_event();
