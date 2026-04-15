-- SQLite: rider password + delivery accepted_at

ALTER TABLE riders ADD COLUMN password_hash TEXT;
ALTER TABLE delivery_orders ADD COLUMN accepted_at TEXT;
