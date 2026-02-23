-- 015: Account uniqueness constraints + bank account ↔ chart-of-accounts linking
-- Ensures account names and codes are unique per tenant,
-- and every shop_bank_account maps to a chart-of-accounts entry.

-- 1. Add description column to accounts (frontend already sends it)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Deduplicate accounts before adding uniqueness constraints.
--    Keeps the oldest account per (tenant_id, LOWER(name)) and
--    re-points ledger_entries to the surviving record.
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT tenant_id, LOWER(name) AS lname,
           MIN(created_at) AS keep_ts
    FROM accounts
    GROUP BY tenant_id, LOWER(name)
    HAVING COUNT(*) > 1
  LOOP
    -- Re-point ledger_entries from duplicates to the surviving account
    UPDATE ledger_entries
    SET account_id = (
      SELECT id FROM accounts
      WHERE tenant_id = dup.tenant_id AND LOWER(name) = dup.lname
      ORDER BY created_at ASC LIMIT 1
    )
    WHERE account_id IN (
      SELECT id FROM accounts
      WHERE tenant_id = dup.tenant_id AND LOWER(name) = dup.lname
      ORDER BY created_at ASC OFFSET 1
    );

    -- Delete the duplicate rows (keep the earliest)
    DELETE FROM accounts
    WHERE id IN (
      SELECT id FROM accounts
      WHERE tenant_id = dup.tenant_id AND LOWER(name) = dup.lname
      ORDER BY created_at ASC OFFSET 1
    );
  END LOOP;
END $$;

-- 3. Unique constraint: account name per tenant (case-insensitive)
--    Prevents duplicate account names within the same tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_tenant_name_unique
  ON accounts (tenant_id, LOWER(name));

-- 4. Unique constraint: account code per tenant (where code is not null)
--    Prevents duplicate account codes within the same tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_tenant_code_unique
  ON accounts (tenant_id, code) WHERE code IS NOT NULL AND code <> '';

-- 5. Link bank accounts to their chart-of-accounts entry
ALTER TABLE shop_bank_accounts
  ADD COLUMN IF NOT EXISTS chart_account_id TEXT REFERENCES accounts(id);

-- 6. For existing bank accounts that have no linked chart account,
--    create matching entries in the accounts table and link them.
--    This DO block runs once during migration.
DO $$
DECLARE
  ba RECORD;
  new_acc_id TEXT;
  acc_type TEXT;
  acc_code TEXT;
  seq INT;
BEGIN
  FOR ba IN
    SELECT id, tenant_id, name, account_type
    FROM shop_bank_accounts
    WHERE chart_account_id IS NULL
  LOOP
    -- Determine account code based on bank type
    IF ba.account_type = 'Cash' THEN
      acc_code := 'AST-100';
    ELSE
      acc_code := 'AST-101';
    END IF;

    -- Make code unique per bank account by appending bank id suffix
    SELECT COUNT(*) INTO seq
    FROM accounts
    WHERE tenant_id = ba.tenant_id AND code LIKE acc_code || '%';

    IF seq > 0 THEN
      acc_code := acc_code || '-' || (seq + 1)::TEXT;
    END IF;

    -- Check if an account with this name already exists for this tenant
    SELECT id INTO new_acc_id
    FROM accounts
    WHERE tenant_id = ba.tenant_id AND LOWER(name) = LOWER(ba.name)
    LIMIT 1;

    IF new_acc_id IS NULL THEN
      new_acc_id := uuid_generate_v4()::TEXT;
      INSERT INTO accounts (id, tenant_id, name, code, type, balance, is_active, description)
      VALUES (new_acc_id, ba.tenant_id, ba.name, acc_code, 'Asset', 0, TRUE,
              'Auto-linked from bank account: ' || ba.name);
    END IF;

    UPDATE shop_bank_accounts SET chart_account_id = new_acc_id WHERE id = ba.id;
  END LOOP;
END $$;
