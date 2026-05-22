CREATE TABLE IF NOT EXISTS delivery_chat_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    sender_id TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_delivery_chat_tenant_order ON delivery_chat_messages (tenant_id, order_id, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    subscriber_type TEXT NOT NULL,
    subscriber_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, subscriber_type, subscriber_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions (tenant_id, subscriber_type, subscriber_id);
