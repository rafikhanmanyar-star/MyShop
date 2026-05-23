-- Add "mobile URL QR code" option to receipt template (show QR at end with "Please scan to order from home")
ALTER TABLE pos_receipt_settings
ADD COLUMN IF NOT EXISTS show_mobile_url_qr BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pos_receipt_settings.show_mobile_url_qr IS 'When true, receipt shows mobile order URL QR code at end with text "Please scan to order from home"';
