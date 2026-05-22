-- SQLite: Unified Order Center (082)

ALTER TABLE mobile_orders ADD COLUMN order_source TEXT NOT NULL DEFAULT 'cart';
ALTER TABLE mobile_orders ADD COLUMN source_reference_id TEXT;
ALTER TABLE mobile_orders ADD COLUMN converted_from_voice_order_id TEXT REFERENCES voice_orders(id);

CREATE INDEX IF NOT EXISTS idx_mobile_orders_order_source ON mobile_orders(tenant_id, order_source, status);

ALTER TABLE voice_orders ADD COLUMN order_source TEXT NOT NULL DEFAULT 'voice';
ALTER TABLE voice_orders ADD COLUMN source_reference_id TEXT;
ALTER TABLE voice_orders ADD COLUMN cancelled_reason TEXT;
ALTER TABLE voice_orders ADD COLUMN cancelled_note TEXT;
ALTER TABLE voice_orders ADD COLUMN cancelled_by TEXT;
ALTER TABLE voice_orders ADD COLUMN cancelled_at TEXT;

CREATE INDEX IF NOT EXISTS idx_voice_orders_cancelled ON voice_orders(tenant_id, cancelled_at);
