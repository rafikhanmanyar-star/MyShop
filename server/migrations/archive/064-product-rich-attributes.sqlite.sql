-- SQLite companion for 064 (rich product attributes)
ALTER TABLE shop_products ADD COLUMN brand TEXT;
ALTER TABLE shop_products ADD COLUMN weight NUMERIC;
ALTER TABLE shop_products ADD COLUMN weight_unit TEXT;
ALTER TABLE shop_products ADD COLUMN size TEXT;
ALTER TABLE shop_products ADD COLUMN color TEXT;
ALTER TABLE shop_products ADD COLUMN material TEXT;
ALTER TABLE shop_products ADD COLUMN origin_country TEXT;
ALTER TABLE shop_products ADD COLUMN attributes TEXT DEFAULT '{}';
