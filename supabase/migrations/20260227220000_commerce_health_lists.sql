-- P1-3: Listas anti-desastre para backoffice (admin-only).
CREATE OR REPLACE FUNCTION public.commerce_health_lists()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  paid_no_pay jsonb;
  dup_pay jsonb;
  expired jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Pedidos paid sem payment aprovado/succeeded
  SELECT COALESCE(jsonb_agg(o.id ORDER BY o.created_at DESC), '[]'::jsonb) INTO paid_no_pay
  FROM orders o
  WHERE o.status = 'paid'
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status IN ('approved', 'succeeded'));

  -- transaction_ids duplicados (retornamos order_ids envolvidos)
  SELECT COALESCE(jsonb_agg(DISTINCT p.order_id ORDER BY p.order_id), '[]'::jsonb) INTO dup_pay
  FROM (
    SELECT provider, transaction_id FROM payments WHERE transaction_id IS NOT NULL
    GROUP BY provider, transaction_id HAVING COUNT(*) > 1
  ) x
  JOIN payments p ON p.provider = x.provider AND p.transaction_id = x.transaction_id;

  -- Reservas expiradas (pending há mais de 15 min)
  SELECT COALESCE(jsonb_agg(o.id ORDER BY o.created_at ASC), '[]'::jsonb) INTO expired
  FROM orders o
  WHERE o.status = 'pending'
  AND o.created_at < (now() - interval '15 minutes');

  result := jsonb_build_object(
    'ok', true,
    'paid_without_payment_order_ids', paid_no_pay,
    'duplicate_payment_order_ids', dup_pay,
    'expired_reservation_order_ids', expired
  );
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.commerce_health_lists() IS 'P1-3: Listas anti-desastre. Admin-only.';
