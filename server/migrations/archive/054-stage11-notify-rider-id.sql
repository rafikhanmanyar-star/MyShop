-- Stage 11: include rider_id in NOTIFY payloads so rider SSE can filter without extra queries.

CREATE OR REPLACE FUNCTION notify_mobile_order_status_for_sse()
RETURNS TRIGGER AS $$
DECLARE
  assigned_rider TEXT;
BEGIN
  SELECT d.rider_id INTO assigned_rider
  FROM delivery_orders d
  WHERE d.order_id = NEW.id AND d.tenant_id = NEW.tenant_id
  LIMIT 1;

  PERFORM pg_notify(
    'mobile_order_updated',
    json_build_object(
      'orderId', NEW.id,
      'tenantId', NEW.tenant_id,
      'customerId', NEW.customer_id,
      'status', NEW.status,
      'source', 'mobile_order',
      'riderId', assigned_rider
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_delivery_order_for_sse()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'mobile_order_updated',
    json_build_object(
      'orderId', NEW.order_id,
      'tenantId', NEW.tenant_id,
      'riderId', NEW.rider_id,
      'source', CASE WHEN TG_OP = 'INSERT' THEN 'delivery_insert' ELSE 'delivery_order' END,
      'deliveryStatus', NEW.status
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
