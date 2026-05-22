-- Expense Management Module
-- Tables: expense_categories, expenses, recurring_expenses

-- Expense categories (system + custom), linked to Chart of Accounts
CREATE TABLE IF NOT EXISTS expense_categories (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    is_system BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant ON expense_categories(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_tenant_name ON expense_categories(tenant_id, LOWER(name));

-- Main expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES shop_branches(id) ON DELETE SET NULL,
    category_id TEXT NOT NULL REFERENCES expense_categories(id),
    vendor_id TEXT REFERENCES shop_vendors(id) ON DELETE SET NULL,
    payee_name TEXT,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    payment_account_id TEXT REFERENCES shop_bank_accounts(id) ON DELETE SET NULL,
    expense_date DATE NOT NULL,
    description TEXT,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'unpaid')),
    payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'Bank', 'Credit')),
    recurring_id TEXT,
    reference_number TEXT,
    tax_amount NUMERIC(15, 2) DEFAULT 0,
    journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses(tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(recurring_id);
CREATE INDEX IF NOT EXISTS idx_expenses_journal ON expenses(journal_entry_id);

-- Recurring expense definitions
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES expense_categories(id),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    next_run_date DATE NOT NULL,
    auto_generate BOOLEAN DEFAULT TRUE,
    last_generated_at TIMESTAMP,
    payee_name TEXT,
    payment_account_id TEXT REFERENCES shop_bank_accounts(id) ON DELETE SET NULL,
    payment_method TEXT DEFAULT 'Bank',
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_tenant ON recurring_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_next_run ON recurring_expenses(tenant_id, next_run_date);

-- RLS (PostgreSQL only; stripped for SQLite by run-migrations)
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON expense_categories;
CREATE POLICY tenant_isolation ON expense_categories FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON expenses;
CREATE POLICY tenant_isolation ON expenses FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON recurring_expenses;
CREATE POLICY tenant_isolation ON recurring_expenses FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
