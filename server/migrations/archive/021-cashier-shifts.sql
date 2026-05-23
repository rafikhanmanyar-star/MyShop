-- Cashier Shifts & Cash Handover Module
-- Tables: cashier_shifts, cash_handover_logs; link sales to shift

-- Shifts: one row per cashier terminal session
CREATE TABLE IF NOT EXISTS cashier_shifts (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cashier_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terminal_id TEXT NOT NULL REFERENCES shop_terminals(id) ON DELETE CASCADE,
    opening_cash DECIMAL(15, 2) NOT NULL DEFAULT 0,
    opening_time TIMESTAMP NOT NULL DEFAULT NOW(),
    closing_cash_expected DECIMAL(15, 2),
    closing_cash_actual DECIMAL(15, 2),
    variance_amount DECIMAL(15, 2),
    variance_reason TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    handed_over_to TEXT REFERENCES users(id) ON DELETE SET NULL,
    closing_time TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    reopened_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_tenant_cashier ON cashier_shifts(tenant_id, cashier_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_tenant_terminal ON cashier_shifts(tenant_id, terminal_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_tenant_status ON cashier_shifts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_opening_time ON cashier_shifts(opening_time);

-- Cash handover log: record when cash is handed to next cashier or admin
CREATE TABLE IF NOT EXISTS cash_handover_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_id TEXT NOT NULL REFERENCES cashier_shifts(id) ON DELETE CASCADE,
    from_cashier_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_handover_logs_shift ON cash_handover_logs(shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_handover_logs_tenant ON cash_handover_logs(tenant_id);

-- Link sales to shift so dashboard can filter by active shift
ALTER TABLE shop_sales ADD COLUMN IF NOT EXISTS shift_id TEXT REFERENCES cashier_shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shop_sales_shift ON shop_sales(shift_id);

-- Shift expenses (petty cash / expenses recorded during shift) - optional table for future use
CREATE TABLE IF NOT EXISTS shift_expenses (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_id TEXT NOT NULL REFERENCES cashier_shifts(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    description TEXT,
    expense_category_id TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
    recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_expenses_shift ON shift_expenses(shift_id);

-- RLS (PostgreSQL only)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cashier_shifts') THEN
    ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON cashier_shifts;
    CREATE POLICY tenant_isolation ON cashier_shifts FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cash_handover_logs') THEN
    ALTER TABLE cash_handover_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON cash_handover_logs;
    CREATE POLICY tenant_isolation ON cash_handover_logs FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'shift_expenses') THEN
    ALTER TABLE shift_expenses ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON shift_expenses;
    CREATE POLICY tenant_isolation ON shift_expenses FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
  END IF;
END $$;
