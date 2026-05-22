-- Shop-wide IANA timezone (used for calendar dates and timestamp day boundaries).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Karachi';

UPDATE tenants
SET timezone = 'Asia/Karachi'
WHERE timezone IS NULL OR TRIM(timezone) = '';

-- Legacy branch labels (GMT+5) → IANA
UPDATE tenants SET timezone = 'Asia/Karachi' WHERE timezone IN ('GMT+5', 'GMT+5:00');
UPDATE tenants SET timezone = 'Asia/Kolkata' WHERE timezone IN ('GMT+5:30', 'GMT+5:30');
