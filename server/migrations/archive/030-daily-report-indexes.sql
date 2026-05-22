-- Daily report performance indexes (aligned with shop schema)

CREATE INDEX IF NOT EXISTS idx_shop_sales_tenant_created_at ON shop_sales(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shop_inventory_movements_tenant_created ON shop_inventory_movements(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shop_products_tenant_created_at ON shop_products(tenant_id, created_at);

-- Optional: product creator for daily report drill-down (FK added separately where supported)
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS created_by TEXT;
