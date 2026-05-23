-- 019: Enterprise Chart of Accounts – schema and structure
-- Adds parent_account_id, normal_balance, level for hierarchical CoA.
-- Default CoA is seeded per-tenant via application (coaSeedService) on registration or first use.

-- 1. Add new columns to accounts (multi-tenant, double-entry, IFRS-style)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS normal_balance TEXT CHECK (normal_balance IN ('debit', 'credit'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS level INT CHECK (level >= 1 AND level <= 4);

-- 2. Index for hierarchy and lookups
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_level ON accounts(tenant_id, level);

-- 3. Backfill normal_balance from type for existing rows (so reporting still works)
UPDATE accounts
SET normal_balance = CASE
  WHEN type IN ('Asset', 'Expense') THEN 'debit'
  WHEN type IN ('Liability', 'Equity', 'Income') THEN 'credit'
  ELSE NULL
END
WHERE normal_balance IS NULL AND type IS NOT NULL;

-- 4. Comment for clarity (optional)
COMMENT ON COLUMN accounts.parent_account_id IS 'Parent in CoA hierarchy; NULL for root. Posting only to leaf accounts.';
COMMENT ON COLUMN accounts.normal_balance IS 'debit or credit – normal balance for this account type';
COMMENT ON COLUMN accounts.level IS '1=root (e.g. 10000), 2=group, 3=subgroup, 4=leaf (postable)';
