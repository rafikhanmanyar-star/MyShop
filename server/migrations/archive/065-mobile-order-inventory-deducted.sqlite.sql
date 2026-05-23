-- SQLite: mobile_orders.inventory_deducted (companion to 065-mobile-order-inventory-deducted.sql)
ALTER TABLE mobile_orders ADD COLUMN inventory_deducted INTEGER NOT NULL DEFAULT 0;

UPDATE mobile_orders
SET inventory_deducted = 1
WHERE status IN ('Confirmed', 'Packed', 'OutForDelivery', 'Delivered')
  AND COALESCE(inventory_deducted, 0) = 0;
