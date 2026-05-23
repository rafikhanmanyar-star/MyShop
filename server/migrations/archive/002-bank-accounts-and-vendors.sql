-- Chart of Accounts: Bank accounts for POS payment linking
CREATE TABLE IF NOT EXISTS shop_bank_accounts (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    account_type TEXT NOT NULL DEFAULT 'Bank',
    currency TEXT DEFAULT 'BDT',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_bank_accounts_tenant ON shop_bank_accounts(tenant_id);

ALTER TABLE shop_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON shop_bank_accounts;
CREATE POLICY tenant_isolation ON shop_bank_accounts FOR ALL
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Vendors for procurement
CREATE TABLE IF NOT EXISTS shop_vendors (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    company_name TEXT,
    contact_no TEXT,
    email TEXT,
    address TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_vendors_tenant ON shop_vendors(tenant_id);

ALTER TABLE shop_vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON shop_vendors;
CREATE POLICY tenant_isolation ON shop_vendors FOR ALL
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());
