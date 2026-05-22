-- Mobile orders: track whether physical stock was FEFO-deducted (legacy: on status Confirmed; current: on Delivered).
-- Prevents double-deduction when changing lifecycle after deploy; backfills rows already past confirmation.

ALTER TABLE mobile_orders
  ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN mobile_orders.inventory_deducted IS
  'When true, shop_inventory was reduced for this order (old flow at Confirmed, new flow at Delivered).';

UPDATE mobile_orders
SET inventory_deducted = TRUE
WHERE status IN ('Confirmed', 'Packed', 'OutForDelivery', 'Delivered')
  AND COALESCE(inventory_deducted, FALSE) = FALSE;
