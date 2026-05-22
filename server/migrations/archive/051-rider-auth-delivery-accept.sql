-- ============================================================================
-- MIGRATION 051: Rider login + delivery accept timestamp (Stage 6)
-- ============================================================================

ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN riders.password_hash IS 'bcrypt hash; set via POS admin (Shop → Riders)';

ALTER TABLE delivery_orders
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;

COMMENT ON COLUMN delivery_orders.accepted_at IS 'Rider tapped Accept (Stage 6 rider app)';
