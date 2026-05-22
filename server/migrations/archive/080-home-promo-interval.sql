-- Carousel rotation speed (seconds) for mobile home promotional ads
ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS home_promo_interval_seconds INTEGER NOT NULL DEFAULT 5;
