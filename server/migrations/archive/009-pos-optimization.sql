-- POS Optimization Indexes and ranking support
-- PostgreSQL / SQLite

-- 1. Search Indexes
CREATE INDEX IF NOT EXISTS idx_shop_products_name ON shop_products(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_shop_products_barcode ON shop_products(tenant_id, barcode);
CREATE INDEX IF NOT EXISTS idx_shop_products_category_id ON shop_products(tenant_id, category_id);

-- 2. Performance Indexes for sales ranking
CREATE INDEX IF NOT EXISTS idx_shop_sale_items_product_id ON shop_sale_items(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_shop_sales_created_at ON shop_sales(tenant_id, created_at);

-- 3. Add popularity score column for fast ranking (denormalized)
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS popularity_score INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_shop_products_popularity ON shop_products(tenant_id, popularity_score DESC);

-- 4. Initial update for popularity score (last 30 days)
-- This is a one-time update, future updates should be handled by a trigger or periodic chore
-- For now, let's just make sure the column exists and is indexed.
