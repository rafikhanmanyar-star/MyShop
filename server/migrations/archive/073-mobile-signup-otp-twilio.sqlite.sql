-- SQLite: Twilio SMS + OTP verification for mobile signup

ALTER TABLE mobile_ordering_settings ADD COLUMN signup_otp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mobile_ordering_settings ADD COLUMN twilio_account_sid TEXT;
ALTER TABLE mobile_ordering_settings ADD COLUMN twilio_auth_token TEXT;
ALTER TABLE mobile_ordering_settings ADD COLUMN twilio_messaging_service_sid TEXT;
ALTER TABLE mobile_ordering_settings ADD COLUMN twilio_from_number TEXT;

CREATE TABLE IF NOT EXISTS mobile_registration_pending (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_e164 TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (tenant_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_mobile_registration_pending_expires
    ON mobile_registration_pending (expires_at);
