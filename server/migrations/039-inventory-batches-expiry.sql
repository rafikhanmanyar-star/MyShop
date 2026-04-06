-- Batch-level expiry tracking (procurement); FEFO sales; legacy backfill

CREATE TABLE IF NOT EXISTS inventory_batches (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE RESTRICT,
    warehouse_id TEXT NOT NULL REFERENCES shop_warehouses(id) ON DELETE CASCADE,
    batch_no TEXT NOT NULL,
    expiry_date DATE,
    quantity_received NUMERIC(15, 4) NOT NULL,
    quantity_remaining NUMERIC(15, 4) NOT NULL,
    cost_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
    purchase_bill_id TEXT REFERENCES purchase_bills(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_inventory_batches_qty CHECK (
        quantity_remaining >= 0
        AND quantity_remaining <= quantity_received
    )
);

-- If inventory_batches already existed from an older/minimal schema, CREATE TABLE IF NOT EXISTS
-- does nothing — add any missing columns (and FKs) before indexes and backfill INSERT.
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES shop_products(id) ON DELETE RESTRICT;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS warehouse_id TEXT REFERENCES shop_warehouses(id) ON DELETE CASCADE;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS batch_no TEXT;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS quantity_received NUMERIC(15, 4);
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS quantity_remaining NUMERIC(15, 4);
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS cost_price NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS purchase_bill_id TEXT REFERENCES purchase_bills(id) ON DELETE CASCADE;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- NULL expiry means "no dated batch" / always sellable (see backfill INSERT). Older tables may have NOT NULL here.
ALTER TABLE inventory_batches ALTER COLUMN expiry_date DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_batches_tenant_product ON inventory_batches(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON inventory_batches(tenant_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_bill ON inventory_batches(tenant_id, purchase_bill_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_wh ON inventory_batches(tenant_id, warehouse_id, product_id);

ALTER TABLE purchase_bill_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE purchase_bill_items ADD COLUMN IF NOT EXISTS batch_no TEXT;

ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inventory_batches;
CREATE POLICY tenant_isolation ON inventory_batches FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Backfill: one legacy batch per positive inventory row (no expiry = always sellable)
INSERT INTO inventory_batches (
    id,
    tenant_id,
    product_id,
    warehouse_id,
    batch_no,
    expiry_date,
    quantity_received,
    quantity_remaining,
    cost_price,
    purchase_bill_id
)
SELECT
    uuid_generate_v4()::text,
    i.tenant_id,
    i.product_id,
    i.warehouse_id,
    'LEGACY-' || substr(md5(random()::text || i.id::text || clock_timestamp()::text), 1, 10),
    NULL,
    GREATEST(i.quantity_on_hand, 0),
    GREATEST(i.quantity_on_hand, 0),
    COALESCE(p.average_cost, p.cost_price, 0),
    NULL
FROM shop_inventory i
JOIN shop_products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
WHERE i.quantity_on_hand > 0
  AND NOT EXISTS (
      SELECT 1 FROM inventory_batches b
      WHERE b.tenant_id = i.tenant_id
        AND b.product_id = i.product_id
        AND b.warehouse_id = i.warehouse_id
  );
