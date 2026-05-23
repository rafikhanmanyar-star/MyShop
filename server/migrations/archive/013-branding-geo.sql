-- Add address and geo coordinates to tenant_branding
ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 8);
ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS lng DECIMAL(11, 8);
