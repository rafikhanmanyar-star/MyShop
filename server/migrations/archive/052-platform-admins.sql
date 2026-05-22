-- Super admins (cross-tenant platform operators). Distinct from tenant-scoped users.

CREATE TABLE IF NOT EXISTS platform_admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_username ON platform_admins (username);
