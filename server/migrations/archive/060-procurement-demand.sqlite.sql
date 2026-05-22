-- Procurement demand: purchase drafts generated from smart demand analysis (SQLite)
CREATE TABLE IF NOT EXISTS procurement_demand_drafts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Draft',
  status TEXT NOT NULL DEFAULT 'draft',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS procurement_demand_draft_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  draft_id TEXT NOT NULL REFERENCES procurement_demand_drafts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  current_stock REAL NOT NULL DEFAULT 0,
  avg_daily_sales REAL NOT NULL DEFAULT 0,
  days_of_stock REAL,
  suggested_qty REAL NOT NULL DEFAULT 0,
  final_qty REAL NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'LOW',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pdd_tenant ON procurement_demand_drafts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pddi_draft ON procurement_demand_draft_items(draft_id);
