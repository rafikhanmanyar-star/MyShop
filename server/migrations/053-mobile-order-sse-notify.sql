-- ============================================================================
-- MIGRATION 053: Real-time customer order updates (Stage 10 — SSE + LISTEN)
-- Notifies channel `mobile_order_updated` when mobile order status or
-- delivery_orders row changes so the customer PWA can refresh without polling.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_mobile_order_status_for_sse()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'mobile_order_updated',
    json_build_object(
      'orderId', NEW.id,
      'tenantId', NEW.tenant_id,
      'customerId', NEW.customer_id,
      'status', NEW.status,
      'source', 'mobile_order'
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mobile_order_status_sse ON mobile_orders;
CREATE TRIGGER trg_mobile_order_status_sse
  AFTER UPDATE OF status ON mobile_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_mobile_order_status_for_sse();

CREATE OR REPLACE FUNCTION notify_delivery_order_for_sse()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'mobile_order_updated',
    json_build_object(
      'orderId', NEW.order_id,
      'tenantId', NEW.tenant_id,
      'source', 'delivery_order',
      'deliveryStatus', NEW.status
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_order_insert_sse ON delivery_orders;
CREATE TRIGGER trg_delivery_order_insert_sse
  AFTER INSERT ON delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_delivery_order_for_sse();

DROP TRIGGER IF EXISTS trg_delivery_order_update_sse ON delivery_orders;
CREATE TRIGGER trg_delivery_order_update_sse
  AFTER UPDATE OF status ON delivery_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_delivery_order_for_sse();
