-- Backfill unit_cost_at_sale for legacy rows where it was stored as NULL but zero cost was intended,
-- or where the original Sale inventory movement has the authoritative snapshot.

UPDATE shop_sale_items si
SET unit_cost_at_sale = sub.uc
FROM (
  SELECT DISTINCT ON (m.tenant_id, m.reference_id, m.product_id)
    m.tenant_id,
    m.reference_id AS sale_id,
    m.product_id,
    m.unit_cost::numeric AS uc
  FROM shop_inventory_movements m
  WHERE m.type = 'Sale'
    AND m.reference_id IS NOT NULL
    AND m.unit_cost IS NOT NULL
  ORDER BY m.tenant_id, m.reference_id, m.product_id, m.created_at ASC NULLS LAST
) sub
WHERE si.unit_cost_at_sale IS NULL
  AND si.tenant_id = sub.tenant_id
  AND si.sale_id = sub.sale_id
  AND si.product_id = sub.product_id;
