-- 016: Merge duplicate Cash accounts in chart of accounts and remove extras
-- Keeps the account linked from shop_bank_accounts (if any), or the oldest by created_at.
-- Re-points all ledger_entries to the kept account, then deletes the duplicate(s).

DO $$
DECLARE
  r RECORD;
  canonical_id TEXT;
BEGIN
  FOR r IN
    SELECT tenant_id
    FROM accounts
    WHERE (LOWER(TRIM(name)) IN ('cash', 'main cash account') OR code LIKE 'AST-100%')
    GROUP BY tenant_id
    HAVING COUNT(*) > 1
  LOOP
    -- Canonical = the one linked from a Cash-type bank account, or else the oldest
    SELECT a.id INTO canonical_id
    FROM accounts a
    LEFT JOIN shop_bank_accounts sba ON sba.chart_account_id = a.id AND sba.tenant_id = a.tenant_id AND sba.account_type = 'Cash'
    WHERE a.tenant_id = r.tenant_id
      AND (LOWER(TRIM(a.name)) IN ('cash', 'main cash account') OR a.code LIKE 'AST-100%')
    ORDER BY (sba.id IS NOT NULL) DESC, a.created_at ASC
    LIMIT 1;

    IF canonical_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Re-point ledger_entries from all other Cash accounts to the canonical one
    UPDATE ledger_entries
    SET account_id = canonical_id
    WHERE tenant_id = r.tenant_id
      AND account_id IN (
        SELECT id FROM accounts
        WHERE tenant_id = r.tenant_id
          AND (LOWER(TRIM(name)) IN ('cash', 'main cash account') OR code LIKE 'AST-100%')
          AND id <> canonical_id
      );

    -- Delete the duplicate account row(s)
    DELETE FROM accounts
    WHERE tenant_id = r.tenant_id
      AND (LOWER(TRIM(name)) IN ('cash', 'main cash account') OR code LIKE 'AST-100%')
      AND id <> canonical_id;
  END LOOP;
END $$;
