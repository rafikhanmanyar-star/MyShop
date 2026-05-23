-- Twilio SMS + OTP verification for mobile app registration (per tenant)

ALTER TABLE mobile_ordering_settings
    ADD COLUMN IF NOT EXISTS signup_otp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
    ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT,
    ADD COLUMN IF NOT EXISTS twilio_messaging_service_sid TEXT,
    ADD COLUMN IF NOT EXISTS twilio_from_number TEXT;

COMMENT ON COLUMN mobile_ordering_settings.signup_otp_enabled IS 'When true and Twilio credentials + sender are set, mobile signup requires SMS OTP.';
COMMENT ON COLUMN mobile_ordering_settings.twilio_from_number IS 'Optional Twilio From number (E.164). Use either this or twilio_messaging_service_sid.';

CREATE TABLE IF NOT EXISTS mobile_registration_pending (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_e164 TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_mobile_registration_pending_expires
    ON mobile_registration_pending (expires_at);
