-- Link khata payment (credit) rows to the debit line they settle, so UI can show "Paid" / hide Receive.

ALTER TABLE khata_ledger ADD COLUMN IF NOT EXISTS linked_debit_id TEXT REFERENCES khata_ledger(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_khata_ledger_linked_debit ON khata_ledger (tenant_id, linked_debit_id) WHERE linked_debit_id IS NOT NULL;
