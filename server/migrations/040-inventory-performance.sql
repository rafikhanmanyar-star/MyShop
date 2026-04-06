-- Inventory list / search performance (large SKU counts)

-- Active products by tenant + name (list ordering / ILIKE prefix-friendly)
CREATE INDEX IF NOT EXISTS idx_shop_products_tenant_active_name
  ON shop_products (tenant_id, name)
  WHERE is_active = TRUE;

-- SKU lookup (exact / prefix search from app)
CREATE INDEX IF NOT EXISTS idx_shop_products_tenant_sku
  ON shop_products (tenant_id, sku)
  WHERE is_active = TRUE;

-- Barcode lookup when present
CREATE INDEX IF NOT EXISTS idx_shop_products_tenant_barcode
  ON shop_products (tenant_id, barcode)
  WHERE is_active = TRUE AND barcode IS NOT NULL AND barcode <> '';

-- Batches with remaining qty (FEFO / expiry filters)
CREATE INDEX IF NOT EXISTS idx_inventory_batches_tenant_product_remaining
  ON inventory_batches (tenant_id, product_id)
  WHERE quantity_remaining > 0;

-- Expiry range scans on non-expired remaining stock
CREATE INDEX IF NOT EXISTS idx_inventory_batches_tenant_expiry_remaining
  ON inventory_batches (tenant_id, expiry_date)
  WHERE quantity_remaining > 0 AND expiry_date IS NOT NULL;
