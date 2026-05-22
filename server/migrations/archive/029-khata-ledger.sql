-- Khata / Loan Management (Customer Credit System)
-- New table only; no changes to existing tables.

CREATE TABLE IF NOT EXISTS khata_ledger (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES shop_sales(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_khata_ledger_tenant ON khata_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_khata_ledger_customer ON khata_ledger(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_khata_ledger_created ON khata_ledger(tenant_id, created_at DESC);

ALTER TABLE khata_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON khata_ledger;
CREATE POLICY tenant_isolation ON khata_ledger FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
