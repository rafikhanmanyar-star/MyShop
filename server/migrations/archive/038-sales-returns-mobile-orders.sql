-- Sales returns: support mobile app orders (mobile_orders) in addition to POS (shop_sales).

-- Track return progress on mobile orders (mirrors shop_sales.status = 'Refunded' for full returns)
ALTER TABLE mobile_orders ADD COLUMN IF NOT EXISTS return_status TEXT NOT NULL DEFAULT 'None';

ALTER TABLE mobile_orders DROP CONSTRAINT IF EXISTS mobile_orders_return_status_check;
ALTER TABLE mobile_orders ADD CONSTRAINT mobile_orders_return_status_check
  CHECK (return_status IN ('None', 'Partial', 'Full'));

-- shop_sales_returns: either original POS sale OR original mobile order
ALTER TABLE shop_sales_returns DROP CONSTRAINT IF EXISTS shop_sales_returns_original_sale_id_fkey;
ALTER TABLE shop_sales_returns ALTER COLUMN original_sale_id DROP NOT NULL;

ALTER TABLE shop_sales_returns ADD COLUMN IF NOT EXISTS original_mobile_order_id TEXT;
ALTER TABLE shop_sales_returns ADD COLUMN IF NOT EXISTS mobile_customer_id TEXT;

ALTER TABLE shop_sales_returns ADD CONSTRAINT shop_sales_returns_original_sale_id_fkey
  FOREIGN KEY (original_sale_id) REFERENCES shop_sales(id) ON DELETE RESTRICT;

ALTER TABLE shop_sales_returns ADD CONSTRAINT shop_sales_returns_original_mobile_order_id_fkey
  FOREIGN KEY (original_mobile_order_id) REFERENCES mobile_orders(id) ON DELETE RESTRICT;

ALTER TABLE shop_sales_returns ADD CONSTRAINT shop_sales_returns_mobile_customer_id_fkey
  FOREIGN KEY (mobile_customer_id) REFERENCES mobile_customers(id) ON DELETE SET NULL;

ALTER TABLE shop_sales_returns DROP CONSTRAINT IF EXISTS shop_sales_returns_original_source_check;
ALTER TABLE shop_sales_returns ADD CONSTRAINT shop_sales_returns_original_source_check
  CHECK (
    (original_sale_id IS NOT NULL AND original_mobile_order_id IS NULL)
    OR (original_sale_id IS NULL AND original_mobile_order_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_shop_sales_returns_tenant_mobile_order
  ON shop_sales_returns (tenant_id, original_mobile_order_id);

-- Return lines: either shop_sale_items or mobile_order_items
ALTER TABLE shop_sales_return_items DROP CONSTRAINT IF EXISTS shop_sales_return_items_sale_line_item_id_fkey;
ALTER TABLE shop_sales_return_items ALTER COLUMN sale_line_item_id DROP NOT NULL;

ALTER TABLE shop_sales_return_items ADD COLUMN IF NOT EXISTS mobile_order_line_item_id TEXT;

ALTER TABLE shop_sales_return_items ADD CONSTRAINT shop_sales_return_items_sale_line_item_id_fkey
  FOREIGN KEY (sale_line_item_id) REFERENCES shop_sale_items(id) ON DELETE RESTRICT;

ALTER TABLE shop_sales_return_items ADD CONSTRAINT shop_sales_return_items_mobile_order_line_item_id_fkey
  FOREIGN KEY (mobile_order_line_item_id) REFERENCES mobile_order_items(id) ON DELETE RESTRICT;

ALTER TABLE shop_sales_return_items DROP CONSTRAINT IF EXISTS shop_sales_return_items_line_ref_check;
ALTER TABLE shop_sales_return_items ADD CONSTRAINT shop_sales_return_items_line_ref_check
  CHECK (
    (sale_line_item_id IS NOT NULL AND mobile_order_line_item_id IS NULL)
    OR (sale_line_item_id IS NULL AND mobile_order_line_item_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_shop_sales_return_items_mobile_line
  ON shop_sales_return_items (tenant_id, mobile_order_line_item_id)
  WHERE mobile_order_line_item_id IS NOT NULL;
