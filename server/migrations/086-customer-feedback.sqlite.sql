CREATE TABLE IF NOT EXISTS customer_feedback (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    order_id TEXT,
    feedback_type TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted',
    priority TEXT NOT NULL DEFAULT 'normal',
    severity_score INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_tenant_status
    ON customer_feedback (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_tenant_type
    ON customer_feedback (tenant_id, feedback_type, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_customer
    ON customer_feedback (tenant_id, customer_id, created_at);

CREATE TABLE IF NOT EXISTS feedback_ratings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    feedback_id TEXT NOT NULL UNIQUE,
    overall_rating INTEGER,
    delivery_rating INTEGER,
    product_quality_rating INTEGER
);

CREATE INDEX IF NOT EXISTS idx_feedback_ratings_tenant ON feedback_ratings (tenant_id, feedback_id);

CREATE TABLE IF NOT EXISTS product_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    feedback_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    notes TEXT,
    barcode TEXT,
    normalized_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_requests_tenant_key ON product_requests (tenant_id, normalized_key);

CREATE TABLE IF NOT EXISTS feedback_attachments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    feedback_id TEXT NOT NULL,
    url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'photo',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_attachments_feedback ON feedback_attachments (tenant_id, feedback_id);

CREATE TABLE IF NOT EXISTS feedback_replies (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    feedback_id TEXT NOT NULL,
    author_type TEXT NOT NULL,
    author_id TEXT,
    author_name TEXT,
    message TEXT NOT NULL,
    is_thank_you INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_replies_feedback ON feedback_replies (tenant_id, feedback_id, created_at);
