-- Add configurable shop information to receipt template (displayed on printed receipts)
ALTER TABLE pos_receipt_settings
  ADD COLUMN IF NOT EXISTS shop_name TEXT,
  ADD COLUMN IF NOT EXISTS shop_address TEXT,
  ADD COLUMN IF NOT EXISTS shop_phone TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN pos_receipt_settings.shop_name IS 'Shop/business name shown on receipt header';
COMMENT ON COLUMN pos_receipt_settings.shop_address IS 'Address line(s) shown on receipt';
COMMENT ON COLUMN pos_receipt_settings.shop_phone IS 'Phone number shown on receipt';
COMMENT ON COLUMN pos_receipt_settings.tax_id IS 'Tax ID / registration number on receipt';
COMMENT ON COLUMN pos_receipt_settings.logo_url IS 'Optional logo image URL for receipt header';
