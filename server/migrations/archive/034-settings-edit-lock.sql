-- Single-row-per-tenant lock for Settings page (multi-user coordination)
CREATE TABLE IF NOT EXISTS settings_edit_locks (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_settings_edit_locks_expires ON settings_edit_locks(expires_at);
