-- Auto-logout after inactivity: 0 = disabled, >0 = minutes of inactivity before auto-logout
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS auto_logout_minutes INTEGER NOT NULL DEFAULT 0;
