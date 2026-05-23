-- Printable margins for thermal receipts (mm). Higher default right margin helps drivers/printers with narrow physical print area (e.g. Black Copper).
ALTER TABLE pos_receipt_settings
  ADD COLUMN IF NOT EXISTS margin_top_mm NUMERIC(5,2) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS margin_bottom_mm NUMERIC(5,2) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS margin_left_mm NUMERIC(5,2) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS margin_right_mm NUMERIC(5,2) NOT NULL DEFAULT 4;

COMMENT ON COLUMN pos_receipt_settings.margin_top_mm IS 'Top margin for printed receipt (mm)';
COMMENT ON COLUMN pos_receipt_settings.margin_bottom_mm IS 'Bottom margin for printed receipt (mm)';
COMMENT ON COLUMN pos_receipt_settings.margin_left_mm IS 'Left margin for printed receipt (mm)';
COMMENT ON COLUMN pos_receipt_settings.margin_right_mm IS 'Right margin for printed receipt (mm); increase if text is clipped on the right';
