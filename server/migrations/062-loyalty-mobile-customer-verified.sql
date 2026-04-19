-- POS staff can mark loyalty members (linked to mobile app accounts) as manually verified.
ALTER TABLE shop_loyalty_members ADD COLUMN IF NOT EXISTS mobile_customer_verified BOOLEAN NOT NULL DEFAULT FALSE;
