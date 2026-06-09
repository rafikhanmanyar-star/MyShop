-- Speed up listInventorySkus / POS sync for large grocery catalogs (~1k+ SKUs per tenant).

CREATE INDEX IF NOT EXISTS idx_shop_inventory_tenant_product
  ON shop_inventory(tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_tenant_warehouse
  ON shop_inventory(tenant_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_tenant_product_wh
  ON inventory_batches(tenant_id, product_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_tenant_expiry
  ON inventory_batches(tenant_id, expiry_date)
  WHERE quantity_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_shop_products_tenant_active_name
  ON shop_products(tenant_id, is_active, name);
