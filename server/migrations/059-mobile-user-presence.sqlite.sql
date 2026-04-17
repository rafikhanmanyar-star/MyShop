-- ============================================================================
-- MIGRATION 059: Mobile User Presence / Heartbeat Tracking (SQLite)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mobile_customer_heartbeats (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    current_page TEXT,
    cart_item_count INTEGER DEFAULT 0,
    cart_total REAL DEFAULT 0,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_mobile_heartbeats_tenant_lastseen
    ON mobile_customer_heartbeats(tenant_id, last_seen_at);
