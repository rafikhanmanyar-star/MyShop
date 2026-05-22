-- Rider enterprise: delivery proof, COD tracking, failed deliveries
ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS delivery_orders_status_check;
ALTER TABLE delivery_orders ADD CONSTRAINT delivery_orders_status_check
  CHECK (status IN ('ASSIGNED', 'PICKED', 'ON_THE_WAY', 'DELIVERED', 'FAILED'));

ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS cod_expected NUMERIC(12, 2);
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS cod_collected NUMERIC(12, 2);
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivery_proof_type TEXT;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivery_proof_data TEXT;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS failed_reason TEXT;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS failed_notes TEXT;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP;

COMMENT ON COLUMN delivery_orders.cod_expected IS 'Expected COD from mobile_orders.grand_total when payment is COD';
COMMENT ON COLUMN delivery_orders.cod_collected IS 'Amount rider collected at delivery';
