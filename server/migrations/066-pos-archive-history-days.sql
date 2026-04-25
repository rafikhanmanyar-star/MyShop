-- How many days of sales to load in the POS Sales Archive (default 30)
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS archive_history_days INTEGER NOT NULL DEFAULT 30;
