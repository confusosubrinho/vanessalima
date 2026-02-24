-- Cancel order and return stock for native (Appmax) orders.
-- When called from admin (auth.uid() set), requires is_admin().
-- When called from service role (e.g. appmax-webhook), auth.uid() is null so check is skipped.
-- For orders with provider NULL or 'appmax': increments product_variants.stock_quantity from order_items,
-- inserts inventory_movements (type 'refund'), then sets order status to 'cancelled'.
-- For Yampi orders: only updates status to 'cancelled' (stock was already returned by yampi-webhook).
CREATE OR REPLACE FUNCTION public.cancel_order_return_stock(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item order_items%ROWTYPE;
BEGIN
  -- Restrict to admins when called by authenticated user (e.g. admin UI)
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden', 'message', 'Apenas administradores podem cancelar pedidos.');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Pedido não encontrado.');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Pedido já estava cancelado.');
  END IF;

  -- Return stock only for native/Appmax orders (no inventory_movements were inserted at payment time)
  IF v_order.provider IS NULL OR v_order.provider = 'appmax' THEN
    FOR v_item IN
      SELECT oi.id, oi.product_variant_id, oi.quantity
      FROM order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.product_variant_id IS NOT NULL
        AND oi.quantity > 0
    LOOP
      UPDATE product_variants
      SET stock_quantity = stock_quantity + v_item.quantity
      WHERE id = v_item.product_variant_id;
      INSERT INTO inventory_movements (variant_id, order_id, type, quantity)
      VALUES (v_item.product_variant_id, p_order_id, 'refund', v_item.quantity);
    END LOOP;
  END IF;

  UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'message', 'Pedido cancelado.');
END;
$$;

COMMENT ON FUNCTION public.cancel_order_return_stock(uuid) IS
  'Cancels order and returns stock for native/Appmax orders. Call from admin or appmax-webhook.';
