-- SQLite companion for 077-mobile-search-analytics.sql

CREATE TABLE IF NOT EXISTS mobile_search_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT,
    session_id TEXT,
    event_type TEXT NOT NULL,
    keyword TEXT,
    product_id TEXT,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mobile_search_events_tenant_created
    ON mobile_search_events (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mobile_trending_search_terms (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    keyword TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    weight INTEGER NOT NULL DEFAULT 100,
    source TEXT NOT NULL DEFAULT 'admin',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_mobile_trending_tenant_active_order
    ON mobile_trending_search_terms (tenant_id, is_active, display_order ASC);
