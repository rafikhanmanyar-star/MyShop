-- ============================================================================
-- MIGRATION 004: Mobile Passwords
-- ============================================================================

ALTER TABLE mobile_customers 
    ADD COLUMN IF NOT EXISTS password TEXT;
