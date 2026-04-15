-- SQLite: riders table (Stage 4)

CREATE TABLE IF NOT EXISTS riders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    current_latitude NUMERIC,
    current_longitude NUMERIC,
    status TEXT NOT NULL DEFAULT 'OFFLINE'
        CHECK (status IN ('AVAILABLE', 'BUSY', 'OFFLINE')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_riders_tenant ON riders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_riders_tenant_status ON riders (tenant_id, status)
    WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_riders_tenant_available ON riders (tenant_id)
    WHERE is_active = 1 AND status = 'AVAILABLE';
