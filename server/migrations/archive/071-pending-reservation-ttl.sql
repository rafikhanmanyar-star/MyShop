-- Per-tenant max age for Pending mobile orders before auto-cancel (releases quantity_reserved).
ALTER TABLE mobile_ordering_settings
    ADD COLUMN IF NOT EXISTS pending_reservation_ttl_minutes INTEGER NOT NULL DEFAULT 30;

COMMENT ON COLUMN mobile_ordering_settings.pending_reservation_ttl_minutes IS
    'Pending orders older than this many minutes are auto-cancelled to release inventory (app clamps 5–10080).';
