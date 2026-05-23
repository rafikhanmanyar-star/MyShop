-- Async export jobs: payload + processing lifecycle

ALTER TABLE report_exports ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE INDEX IF NOT EXISTS idx_report_exports_pending ON report_exports(tenant_id, status, created_at)
    WHERE status IN ('pending', 'processing');
