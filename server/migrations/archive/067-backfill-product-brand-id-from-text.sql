-- Link shop_products.brand (SKU text) to shop_brands and set brand_id where missing.

UPDATE shop_products p
SET brand_id = b.id
FROM shop_brands b
WHERE p.tenant_id = b.tenant_id
  AND p.brand_id IS NULL
  AND p.brand IS NOT NULL
  AND TRIM(p.brand) <> ''
  AND LOWER(TRIM(p.brand)) = LOWER(TRIM(b.name));
