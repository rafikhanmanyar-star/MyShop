-- Mobile catalog search analytics, trending terms, and personalization signals (PostgreSQL).

CREATE TABLE IF NOT EXISTS mobile_search_events (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT REFERENCES mobile_customers(id) ON DELETE SET NULL,
    session_id TEXT,
    event_type TEXT NOT NULL,
    keyword TEXT,
    product_id TEXT REFERENCES shop_products(id) ON DELETE SET NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_search_events_tenant_created
    ON mobile_search_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mobile_search_events_tenant_type_kw
    ON mobile_search_events (tenant_id, event_type, keyword);

CREATE INDEX IF NOT EXISTS idx_mobile_search_events_customer
    ON mobile_search_events (customer_id, created_at DESC);

COMMENT ON TABLE mobile_search_events IS 'Search and discovery analytics (keywords, clicks, zero-result, conversions).';

CREATE TABLE IF NOT EXISTS mobile_trending_search_terms (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    weight INTEGER NOT NULL DEFAULT 100,
    source TEXT NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_trending_unique_kw
    ON mobile_trending_search_terms (tenant_id, (lower(keyword)));

CREATE INDEX IF NOT EXISTS idx_mobile_trending_tenant_active_order
    ON mobile_trending_search_terms (tenant_id, is_active, display_order ASC);

COMMENT ON TABLE mobile_trending_search_terms IS 'Curated trending search chips; source admin|analytics.';
