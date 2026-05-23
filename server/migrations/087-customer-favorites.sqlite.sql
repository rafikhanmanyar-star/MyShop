-- ============================================================================
-- MIGRATION 087: Customer product favorites (mobile) — SQLite
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_favorites (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_customer
    ON customer_favorites (tenant_id, customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_product
    ON customer_favorites (tenant_id, product_id);
