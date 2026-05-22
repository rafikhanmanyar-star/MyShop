-- Mobile app category rail: optional icon image per product category (configured in POS Inventory → Categories).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS mobile_icon_url TEXT;
