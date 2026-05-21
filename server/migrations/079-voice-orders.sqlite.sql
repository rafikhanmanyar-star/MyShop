-- SQLite: voice ordering (079)

CREATE TABLE IF NOT EXISTS voice_order_settings (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    is_enabled INTEGER DEFAULT 0,
    max_recording_seconds INTEGER DEFAULT 120,
    max_upload_bytes INTEGER DEFAULT 10485760,
    transcription_enabled INTEGER DEFAULT 0,
    transcription_provider TEXT DEFAULT 'none',
    transcription_api_key TEXT,
    push_enabled INTEGER DEFAULT 1,
    sms_enabled INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS voice_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES shop_branches(id),
    audio_url TEXT,
    audio_duration_seconds REAL,
    audio_mime_type TEXT,
    transcription_text TEXT,
    transcription_items_json TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    notes TEXT,
    delivery_mode TEXT DEFAULT 'delivery',
    delivery_address TEXT,
    delivery_lat REAL,
    delivery_lng REAL,
    created_invoice_id TEXT REFERENCES shop_sales(id),
    mobile_order_id TEXT REFERENCES mobile_orders(id),
    customer_approved_at TEXT,
    received_at TEXT,
    invoice_created_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_voice_orders_tenant ON voice_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_orders_customer ON voice_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_voice_orders_status ON voice_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_voice_orders_created ON voice_orders(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS voice_order_status_history (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    voice_order_id TEXT NOT NULL REFERENCES voice_orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by TEXT,
    changed_by_type TEXT DEFAULT 'system',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_voice_order_status_history_order
    ON voice_order_status_history(voice_order_id);
