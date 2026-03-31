-- Immutable cost snapshot per line at transaction time (COGS / margin reporting).
-- Historical rows keep their stored cost when product master prices change.

ALTER TABLE shop_sale_items ADD COLUMN IF NOT EXISTS unit_cost_at_sale DECIMAL(15, 2);

ALTER TABLE mobile_order_items ADD COLUMN IF NOT EXISTS unit_cost_at_sale DECIMAL(15, 2);

COMMENT ON COLUMN shop_sale_items.unit_cost_at_sale IS 'Unit cost (WAC or cost_price) at POS sale time; COGS uses this snapshot.';
COMMENT ON COLUMN mobile_order_items.unit_cost_at_sale IS 'Unit cost at revenue recognition (delivery); set when posting COGS.';
