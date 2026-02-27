
-- 1. Add cart_id column to orders (used by checkout to prevent duplicate checkout per cart)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_cart_id_unique ON public.orders (cart_id) WHERE cart_id IS NOT NULL;

-- 2. Index on payments(provider, transaction_id) for performance
CREATE INDEX IF NOT EXISTS idx_payments_provider_transaction_id ON public.payments (provider, transaction_id);

-- 3. RPC cancel_order_return_stock
CREATE OR REPLACE FUNCTION public.cancel_order_return_stock(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_restored integer := 0;
BEGIN
  -- Check admin or service role
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT id, status INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_cancelled');
  END IF;

  -- Update order status
  UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = p_order_id;

  -- Restore stock from order_items
  FOR v_item IN
    SELECT product_variant_id, quantity FROM public.order_items
    WHERE order_id = p_order_id AND product_variant_id IS NOT NULL
  LOOP
    UPDATE public.product_variants
    SET stock_quantity = stock_quantity + v_item.quantity
    WHERE id = v_item.product_variant_id;

    INSERT INTO public.inventory_movements (variant_id, order_id, quantity, type)
    VALUES (v_item.product_variant_id, p_order_id, v_item.quantity, 'refund');

    v_restored := v_restored + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'restored_variants', v_restored);
END;
$$;

-- 4. RPC commerce_health
CREATE OR REPLACE FUNCTION public.commerce_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_idx boolean;
  v_dup_payments integer;
  v_neg_stock integer;
  v_paid_no_payment integer;
  v_payment_no_paid integer;
  v_last_stripe_webhook timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  -- Check index exists
  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'payments'
    AND indexname = 'idx_payments_provider_transaction_id'
  ) INTO v_idx;

  -- Duplicate payments (same order_id, provider, transaction_id)
  SELECT count(*) INTO v_dup_payments
  FROM (
    SELECT order_id, provider, transaction_id, count(*) as cnt
    FROM public.payments
    WHERE transaction_id IS NOT NULL
    GROUP BY order_id, provider, transaction_id
    HAVING count(*) > 1
  ) sub;

  -- Negative stock
  SELECT count(*) INTO v_neg_stock
  FROM public.product_variants WHERE stock_quantity < 0;

  -- Orders paid without any payment record
  SELECT count(*) INTO v_paid_no_payment
  FROM public.orders o
  WHERE o.status = 'paid'
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id);

  -- Payments succeeded but order not paid
  SELECT count(*) INTO v_payment_no_paid
  FROM public.payments p
  JOIN public.orders o ON o.id = p.order_id
  WHERE p.status = 'succeeded' AND o.status != 'paid';

  -- Last stripe webhook
  SELECT max(created_at) INTO v_last_stripe_webhook
  FROM public.stripe_webhook_events;

  v_result := jsonb_build_object(
    'ok', (v_dup_payments = 0 AND v_neg_stock = 0 AND v_paid_no_payment = 0 AND v_payment_no_paid = 0),
    'checks', jsonb_build_object(
      'index_payments_provider_transaction_id', v_idx,
      'duplicate_payments_count', v_dup_payments,
      'negative_stock_count', v_neg_stock,
      'orders_paid_without_payment_count', v_paid_no_payment,
      'payments_succeeded_without_order_paid_count', v_payment_no_paid,
      'last_stripe_webhook_at', v_last_stripe_webhook
    )
  );

  RETURN v_result;
END;
$$;

-- 5. RPC commerce_health_lists
CREATE OR REPLACE FUNCTION public.commerce_health_lists()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_paid_no_payment uuid[];
  v_dup_payment uuid[];
  v_expired_reservations uuid[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  -- Orders paid without payment
  SELECT array_agg(o.id) INTO v_paid_no_payment
  FROM public.orders o
  WHERE o.status = 'paid'
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id);

  -- Orders with duplicate payments
  SELECT array_agg(DISTINCT sub.order_id) INTO v_dup_payment
  FROM (
    SELECT order_id
    FROM public.payments
    WHERE transaction_id IS NOT NULL
    GROUP BY order_id, provider, transaction_id
    HAVING count(*) > 1
  ) sub;

  -- Expired pending orders (> 2h old, still pending)
  SELECT array_agg(o.id) INTO v_expired_reservations
  FROM public.orders o
  WHERE o.status = 'pending'
  AND o.created_at < now() - interval '2 hours';

  RETURN jsonb_build_object(
    'ok', true,
    'paid_without_payment_order_ids', COALESCE(v_paid_no_payment, '{}'),
    'duplicate_payment_order_ids', COALESCE(v_dup_payment, '{}'),
    'expired_reservation_order_ids', COALESCE(v_expired_reservations, '{}')
  );
END;
$$;
