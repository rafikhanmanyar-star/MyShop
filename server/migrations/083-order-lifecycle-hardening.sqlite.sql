-- SQLite: order lifecycle hardening (083)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_orders_one_voice_conversion
    ON mobile_orders(tenant_id, converted_from_voice_order_id)
    WHERE converted_from_voice_order_id IS NOT NULL;
