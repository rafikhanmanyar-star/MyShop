ALTER TABLE pos_receipt_settings
ADD COLUMN IF NOT EXISTS barcode_size VARCHAR(20) DEFAULT 'medium';
