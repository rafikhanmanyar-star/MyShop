-- Mobile home hero / promo carousel images (uploaded from POS → Mobile branding)
ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS home_promo_slides TEXT DEFAULT '[]';
