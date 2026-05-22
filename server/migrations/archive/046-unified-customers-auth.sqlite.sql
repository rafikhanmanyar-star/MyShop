-- SQLite variant: unified customers + password reset (minimal; backfill skipped in dev)

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    password TEXT,
    address TEXT,
    is_loyalty_member INTEGER NOT NULL DEFAULT 1,
    created_from TEXT NOT NULL CHECK (created_from IN ('POS', 'MOBILE')),
    pos_contact_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers (tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_name_lower ON customers (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tenant_status ON password_reset_requests (tenant_id, status);
