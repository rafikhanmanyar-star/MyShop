-- SQLite companion for 037-system-logs.sql (audit + diagnostics)

CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    module TEXT NOT NULL,
    payload TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_created ON system_logs(tenant_id, created_at DESC);
