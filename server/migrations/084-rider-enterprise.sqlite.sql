-- SQLite: rider enterprise delivery fields
-- Recreate check via table rebuild not needed; SQLite has loose typing on status
ALTER TABLE delivery_orders ADD COLUMN arrived_at TEXT;
ALTER TABLE delivery_orders ADD COLUMN cod_expected REAL;
ALTER TABLE delivery_orders ADD COLUMN cod_collected REAL;
ALTER TABLE delivery_orders ADD COLUMN delivery_proof_type TEXT;
ALTER TABLE delivery_orders ADD COLUMN delivery_proof_data TEXT;
ALTER TABLE delivery_orders ADD COLUMN failed_reason TEXT;
ALTER TABLE delivery_orders ADD COLUMN failed_notes TEXT;
ALTER TABLE delivery_orders ADD COLUMN failed_at TEXT;
