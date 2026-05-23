-- Procurement & Supplier Payment Accounting
-- Purchase bills, supplier payments, inventory valuation (weighted average), AP ledger

-- 1. Purchase bills (supplier invoices)
CREATE TABLE IF NOT EXISTS purchase_bills (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id TEXT NOT NULL REFERENCES shop_vendors(id) ON DELETE RESTRICT,
    bill_number TEXT NOT NULL,
    bill_date TIMESTAMP NOT NULL DEFAULT NOW(),
    due_date TIMESTAMP,
    subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    balance_due DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Posted',
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_bills_tenant ON purchase_bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_supplier ON purchase_bills(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_bill_date ON purchase_bills(tenant_id, bill_date);

-- 2. Purchase bill line items
CREATE TABLE IF NOT EXISTS purchase_bill_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_bill_id TEXT NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE RESTRICT,
    quantity DECIMAL(15, 2) NOT NULL,
    unit_cost DECIMAL(15, 2) NOT NULL,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    subtotal DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_bill ON purchase_bill_items(purchase_bill_id);

-- 3. Supplier payments
CREATE TABLE IF NOT EXISTS supplier_payments (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id TEXT NOT NULL REFERENCES shop_vendors(id) ON DELETE RESTRICT,
    amount DECIMAL(15, 2) NOT NULL,
    payment_method TEXT NOT NULL,
    bank_account_id TEXT REFERENCES shop_bank_accounts(id) ON DELETE SET NULL,
    payment_date TIMESTAMP NOT NULL DEFAULT NOW(),
    reference TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant ON supplier_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(tenant_id, supplier_id);

-- 4. Allocation: which payment applies to which bill
CREATE TABLE IF NOT EXISTS purchase_bill_payments (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_bill_id TEXT NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
    supplier_payment_id TEXT NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_bill_payments_bill ON purchase_bill_payments(purchase_bill_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_payments_payment ON purchase_bill_payments(supplier_payment_id);

-- 5. Product weighted average cost (for COGS and inventory valuation)
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS average_cost DECIMAL(15, 2) DEFAULT 0;

-- 6. Inventory movements: unit_cost and total_cost for purchase/sale audit
ALTER TABLE shop_inventory_movements ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15, 2);
ALTER TABLE shop_inventory_movements ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15, 2);

-- RLS (PostgreSQL only; stripped for SQLite by run-migrations)
ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON purchase_bills;
CREATE POLICY tenant_isolation ON purchase_bills FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE purchase_bill_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON purchase_bill_items;
CREATE POLICY tenant_isolation ON purchase_bill_items FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON supplier_payments;
CREATE POLICY tenant_isolation ON supplier_payments FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE purchase_bill_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON purchase_bill_payments;
CREATE POLICY tenant_isolation ON purchase_bill_payments FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
