-- Accounting Database Schema
-- Adds missing tables for Double-Entry Accounting and Reports

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    type TEXT NOT NULL,
    balance DECIMAL(15, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL DEFAULT NOW(),
    reference TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Posted',
    source_module TEXT,
    source_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant ON journal_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    debit DECIMAL(15, 2) DEFAULT 0,
    credit DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_account ON ledger_entries(tenant_id, account_id);

CREATE TABLE IF NOT EXISTS customer_balance (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    balance DECIMAL(15, 2) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (tenant_id, customer_id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL DEFAULT NOW(),
    type TEXT,
    amount DECIMAL(15, 2) DEFAULT 0,
    reference TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_aggregates (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    report_name TEXT NOT NULL,
    data JSONB,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (tenant_id, report_name)
);

-- RLS Policies
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON accounts;
CREATE POLICY tenant_isolation ON accounts FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON journal_entries;
CREATE POLICY tenant_isolation ON journal_entries FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ledger_entries;
CREATE POLICY tenant_isolation ON ledger_entries FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE customer_balance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON customer_balance;
CREATE POLICY tenant_isolation ON customer_balance FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON transactions;
CREATE POLICY tenant_isolation ON transactions FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());

ALTER TABLE report_aggregates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON report_aggregates;
CREATE POLICY tenant_isolation ON report_aggregates FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
