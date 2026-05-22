-- Procurement demand: purchase drafts generated from smart demand analysis
CREATE TABLE IF NOT EXISTS procurement_demand_drafts (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Draft',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'converted', 'cancelled')),
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procurement_demand_draft_items (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES procurement_demand_drafts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES shop_products(id),
  current_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  avg_daily_sales NUMERIC(12,4) NOT NULL DEFAULT 0,
  days_of_stock NUMERIC(10,2),
  suggested_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'LOW' CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW', 'NO_DATA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE procurement_demand_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_demand_draft_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_pdd ON procurement_demand_drafts
  USING (tenant_id = current_setting('app.current_tenant_id'));
CREATE POLICY tenant_isolation_pddi ON procurement_demand_draft_items
  USING (tenant_id = current_setting('app.current_tenant_id'));

CREATE INDEX IF NOT EXISTS idx_pdd_tenant ON procurement_demand_drafts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pddi_draft ON procurement_demand_draft_items(draft_id);
