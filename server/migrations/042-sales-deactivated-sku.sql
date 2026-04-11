-- Manual "deactivate for sales": hide SKU from mobile catalog and POS while keeping the row for history and inventory management.
ALTER TABLE shop_products
    ADD COLUMN IF NOT EXISTS sales_deactivated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN shop_products.sales_deactivated IS 'When true, SKU is hidden from mobile browsing and POS product selection; still visible in admin inventory and past transactions.';

CREATE INDEX IF NOT EXISTS idx_shop_products_sales_listing
    ON shop_products(tenant_id)
    WHERE sales_deactivated = FALSE;
