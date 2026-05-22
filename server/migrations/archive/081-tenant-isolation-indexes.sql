-- Reinforce tenant-scoped query performance and isolation audits (idempotent).

CREATE INDEX IF NOT EXISTS idx_mobile_orders_tenant_id_created
  ON mobile_orders(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_sales_tenant_id_created
  ON shop_sales(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mobile_customers_tenant_id
  ON mobile_customers(tenant_id);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id
  ON customers(tenant_id);

CREATE INDEX IF NOT EXISTS idx_shop_products_tenant_id
  ON shop_products(tenant_id);
