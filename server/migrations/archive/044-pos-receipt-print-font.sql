-- Receipt print typography (thermal-friendly; defaults match client receiptBuilder)
ALTER TABLE pos_receipt_settings
  ADD COLUMN IF NOT EXISTS print_font_family TEXT NOT NULL DEFAULT 'roboto_mono',
  ADD COLUMN IF NOT EXISTS print_font_size INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS print_font_weight TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS print_line_spacing NUMERIC(4,2) NOT NULL DEFAULT 1.2;

COMMENT ON COLUMN pos_receipt_settings.print_font_family IS 'Receipt font preset: roboto_mono, courier_new, roboto, inter';
COMMENT ON COLUMN pos_receipt_settings.print_font_size IS 'Base receipt font size in px (app clamps 10–18)';
COMMENT ON COLUMN pos_receipt_settings.print_font_weight IS 'normal | medium | bold';
COMMENT ON COLUMN pos_receipt_settings.print_line_spacing IS 'CSS line-height multiplier for receipt body';
