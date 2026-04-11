-- Track loyalty awards for mobile app orders (mirrors shop_sales points_earned / loyalty link).
ALTER TABLE mobile_orders ADD COLUMN IF NOT EXISTS loyalty_member_id TEXT REFERENCES shop_loyalty_members(id);
ALTER TABLE mobile_orders ADD COLUMN IF NOT EXISTS points_earned INTEGER NOT NULL DEFAULT 0;
