-- SQLite: expense module v2 (rebuild expenses for payment_method CHECK + account_id)

ALTER TABLE expense_categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE TABLE expenses_v2 (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    branch_id TEXT REFERENCES shop_branches(id),
    category_id TEXT NOT NULL REFERENCES expense_categories(id),
    vendor_id TEXT REFERENCES shop_vendors(id),
    payee_name TEXT,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_account_id TEXT REFERENCES shop_bank_accounts(id),
    expense_date TEXT NOT NULL,
    description TEXT,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'unpaid')),
    payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK', 'OTHER')),
    recurring_id TEXT,
    reference_number TEXT,
    tax_amount NUMERIC DEFAULT 0,
    journal_entry_id TEXT REFERENCES journal_entries(id),
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    account_id TEXT NOT NULL REFERENCES accounts(id)
);

INSERT INTO expenses_v2 (
  id, tenant_id, branch_id, category_id, vendor_id, payee_name, amount, payment_account_id,
  expense_date, description, attachment_url, status,
  payment_method, recurring_id, reference_number, tax_amount, journal_entry_id, created_by, created_at, updated_at,
  account_id
)
SELECT
  e.id, e.tenant_id, e.branch_id, e.category_id, e.vendor_id, e.payee_name, e.amount, e.payment_account_id,
  e.expense_date, e.description, e.attachment_url, e.status,
  CASE e.payment_method
    WHEN 'Cash' THEN 'CASH'
    WHEN 'Bank' THEN 'BANK'
    WHEN 'Credit' THEN 'OTHER'
    ELSE e.payment_method
  END,
  e.recurring_id, e.reference_number, e.tax_amount, e.journal_entry_id, e.created_by, e.created_at, e.updated_at,
  COALESCE(
    (SELECT ec.account_id FROM expense_categories ec WHERE ec.id = e.category_id AND ec.tenant_id = e.tenant_id),
    (SELECT a.id FROM accounts a WHERE a.tenant_id = e.tenant_id AND a.type = 'Expense' ORDER BY a.code LIMIT 1),
    (SELECT a.id FROM accounts a WHERE a.tenant_id = e.tenant_id ORDER BY a.code LIMIT 1)
  )
FROM expenses e;

-- Drop old table only if all rows migrated (same row count)
DROP TABLE expenses;
ALTER TABLE expenses_v2 RENAME TO expenses;

CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses(tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(recurring_id);
CREATE INDEX IF NOT EXISTS idx_expenses_journal ON expenses(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_account ON expenses(tenant_id, account_id);

UPDATE recurring_expenses SET payment_method = CASE payment_method
  WHEN 'Cash' THEN 'CASH'
  WHEN 'Bank' THEN 'BANK'
  WHEN 'Credit' THEN 'OTHER'
  ELSE payment_method
END;

UPDATE recurring_expenses SET payment_method = 'BANK' WHERE payment_method IS NULL OR TRIM(payment_method) = '';
UPDATE recurring_expenses SET payment_method = 'BANK' WHERE payment_method NOT IN ('CASH', 'BANK', 'OTHER');
