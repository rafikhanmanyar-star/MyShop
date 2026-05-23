-- Draft purchase bills: no inventory/GL until explicitly posted
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS is_posted BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE purchase_bills SET is_posted = TRUE WHERE is_posted IS NULL;
