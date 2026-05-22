-- SQLite: delivery_orders (Stage 5)

CREATE TABLE IF NOT EXISTS delivery_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES mobile_orders(id) ON DELETE CASCADE,
    rider_id TEXT NOT NULL REFERENCES riders(id),
    status TEXT NOT NULL DEFAULT 'ASSIGNED'
        CHECK (status IN ('ASSIGNED', 'PICKED', 'ON_THE_WAY', 'DELIVERED')),
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    picked_at TEXT,
    delivered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_tenant ON delivery_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider ON delivery_orders (tenant_id, rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders (tenant_id, status);
