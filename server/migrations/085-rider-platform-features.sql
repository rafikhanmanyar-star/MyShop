-- Chat, push subscriptions, rider ratings placeholder
CREATE TABLE IF NOT EXISTS delivery_chat_messages (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES mobile_orders(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('rider', 'shop', 'customer')),
    sender_id TEXT,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_chat_tenant_order ON delivery_chat_messages (tenant_id, order_id, created_at);

ALTER TABLE delivery_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON delivery_chat_messages;
CREATE POLICY tenant_isolation ON delivery_chat_messages FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscriber_type TEXT NOT NULL CHECK (subscriber_type IN ('rider', 'customer', 'shop_user')),
    subscriber_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, subscriber_type, subscriber_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions (tenant_id, subscriber_type, subscriber_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON push_subscriptions;
CREATE POLICY tenant_isolation ON push_subscriptions FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
