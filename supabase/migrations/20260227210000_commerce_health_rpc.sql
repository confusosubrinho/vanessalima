-- P0-5: Commerce health check RPC (admin-only). Returns checks for index, duplicates, negative stock, orphan orders/payments.
CREATE OR REPLACE FUNCTION public.commerce_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  idx_exists boolean;
  dup_payments bigint;
  neg_stock bigint;
  paid_no_payment bigint;
  payment_no_paid bigint;
  last_webhook timestamp with time zone;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'payments' AND indexname LIKE '%provider%transaction%'
  ) INTO idx_exists;

  SELECT COUNT(*) INTO dup_payments FROM (
    SELECT provider, transaction_id, COUNT(*) c
    FROM payments WHERE transaction_id IS NOT NULL
    GROUP BY provider, transaction_id HAVING COUNT(*) > 1
  ) x;

  SELECT COUNT(*) INTO neg_stock
  FROM product_variants WHERE stock_quantity < 0;

  SELECT COUNT(*) INTO paid_no_payment
  FROM orders o
  WHERE o.status = 'paid'
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status IN ('approved', 'succeeded'));

  SELECT COUNT(*) INTO payment_no_paid
  FROM payments p
  WHERE p.status IN ('approved', 'succeeded')
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = p.order_id AND o.status = 'paid');

  SELECT MAX(created_at) INTO last_webhook FROM stripe_webhook_events LIMIT 1;

  result := jsonb_build_object(
    'ok', idx_exists AND dup_payments = 0 AND neg_stock = 0 AND paid_no_payment = 0 AND payment_no_paid = 0,
    'checks', jsonb_build_object(
      'index_payments_provider_transaction_id', idx_exists,
      'duplicate_payments_count', dup_payments,
      'negative_stock_count', neg_stock,
      'orders_paid_without_payment_count', paid_no_payment,
      'payments_succeeded_without_order_paid_count', payment_no_paid,
      'last_stripe_webhook_at', last_webhook
    )
  );
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.commerce_health() IS 'P0-5: Commerce health checks. Admin-only.';
