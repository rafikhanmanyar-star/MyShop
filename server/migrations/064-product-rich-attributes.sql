-- ============================================================================
-- MIGRATION 064: Rich product attributes (POS + mobile PDP)
-- SKU code remains the canonical `sku` column; API exposes `sku_code` as alias.
-- ============================================================================

ALTER TABLE shop_products
    ADD COLUMN IF NOT EXISTS brand TEXT,
    ADD COLUMN IF NOT EXISTS weight NUMERIC(15, 4),
    ADD COLUMN IF NOT EXISTS weight_unit TEXT,
    ADD COLUMN IF NOT EXISTS size TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT,
    ADD COLUMN IF NOT EXISTS material TEXT,
    ADD COLUMN IF NOT EXISTS origin_country TEXT,
    ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;

UPDATE shop_products SET attributes = '{}'::jsonb WHERE attributes IS NULL;
