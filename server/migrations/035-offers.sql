-- Offers Management: promotional bundles and discounts for mobile ordering

DO $$ BEGIN
  CREATE TYPE offer_type_enum AS ENUM ('discount', 'bundle', 'fixed_price');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE offer_discount_type_enum AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    offer_type offer_type_enum NOT NULL,
    discount_type offer_discount_type_enum,
    discount_value NUMERIC(15, 4),
    fixed_price NUMERIC(15, 2),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    max_usage_per_user INTEGER,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT offers_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_offers_tenant_active_dates
    ON offers(tenant_id, start_date, end_date, is_active);

CREATE TABLE IF NOT EXISTS offer_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1,
    CONSTRAINT offer_items_qty_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_offer_items_offer_id ON offer_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_product_id ON offer_items(product_id);

-- Per-customer usage caps (optional max_usage_per_user on offers)
CREATE TABLE IF NOT EXISTS mobile_customer_offer_usage (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, customer_id, offer_id)
);

CREATE INDEX IF NOT EXISTS idx_mobile_customer_offer_usage_offer
    ON mobile_customer_offer_usage(tenant_id, offer_id);

-- Line items may belong to an applied offer (for reporting / display)
ALTER TABLE mobile_order_items
    ADD COLUMN IF NOT EXISTS offer_id TEXT REFERENCES offers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mobile_order_items_offer
    ON mobile_order_items(offer_id) WHERE offer_id IS NOT NULL;

-- Stacking: 'best' = single best-value offer bundle per order; 'stack' = multiple offers if no product overlap
ALTER TABLE mobile_ordering_settings
    ADD COLUMN IF NOT EXISTS offer_stacking_mode TEXT NOT NULL DEFAULT 'best';

-- Normalize invalid values
UPDATE mobile_ordering_settings
SET offer_stacking_mode = 'best'
WHERE offer_stacking_mode IS NULL OR offer_stacking_mode NOT IN ('best', 'stack');

ALTER TABLE mobile_ordering_settings
    DROP CONSTRAINT IF EXISTS mobile_ordering_settings_offer_stacking_mode_check;

ALTER TABLE mobile_ordering_settings
    ADD CONSTRAINT mobile_ordering_settings_offer_stacking_mode_check
    CHECK (offer_stacking_mode IN ('best', 'stack'));
