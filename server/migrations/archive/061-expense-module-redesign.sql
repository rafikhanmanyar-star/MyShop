-- Expense module v2: explicit expense account per row, category active flag, CASH/BANK/OTHER payment methods

-- 1) Categories: soft-activate
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE expense_categories SET is_active = TRUE WHERE is_active IS NULL;

-- 2) Expenses: Chart of Accounts expense account (debit side of journal)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id);

UPDATE expenses e
SET account_id = ec.account_id
FROM expense_categories ec
WHERE e.category_id = ec.id
  AND ec.tenant_id = e.tenant_id
  AND (e.account_id IS NULL);

UPDATE expenses e
SET account_id = (
  SELECT a.id FROM accounts a
  WHERE a.tenant_id = e.tenant_id AND a.type = 'Expense'
  ORDER BY a.code NULLS LAST
  LIMIT 1
)
WHERE e.account_id IS NULL;

UPDATE expenses e
SET account_id = (
  SELECT a.id FROM accounts a
  WHERE a.tenant_id = e.tenant_id
  ORDER BY a.code NULLS LAST
  LIMIT 1
)
WHERE e.account_id IS NULL;

ALTER TABLE expenses ALTER COLUMN account_id SET NOT NULL;

-- 3) Payment method: must DROP old CHECK before UPDATE — new values would fail legacy ('Cash'|'Bank'|'Credit') check
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;

UPDATE expenses
SET payment_method = CASE payment_method
  WHEN 'Cash' THEN 'CASH'
  WHEN 'Bank' THEN 'BANK'
  WHEN 'Credit' THEN 'OTHER'
  WHEN 'CASH' THEN 'CASH'
  WHEN 'BANK' THEN 'BANK'
  WHEN 'OTHER' THEN 'OTHER'
  ELSE payment_method
END;

UPDATE expenses
SET payment_method = 'OTHER'
WHERE payment_method IS NULL OR TRIM(payment_method) = '' OR payment_method NOT IN ('CASH', 'BANK', 'OTHER');

ALTER TABLE expenses ADD CONSTRAINT expenses_payment_method_check
  CHECK (payment_method IN ('CASH', 'BANK', 'OTHER'));

ALTER TABLE expenses ALTER COLUMN payment_method SET DEFAULT 'CASH';

-- 4) Recurring templates (no CHECK in original migration; normalize for API)
UPDATE recurring_expenses
SET payment_method = CASE payment_method
  WHEN 'Cash' THEN 'CASH'
  WHEN 'Bank' THEN 'BANK'
  WHEN 'Credit' THEN 'OTHER'
  ELSE payment_method
END;

UPDATE recurring_expenses
SET payment_method = 'BANK'
WHERE payment_method IS NULL OR TRIM(payment_method) = '';

UPDATE recurring_expenses
SET payment_method = 'BANK'
WHERE payment_method NOT IN ('CASH', 'BANK', 'OTHER');

-- 5) Indexes for reporting filters
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_account ON expenses(tenant_id, account_id);
