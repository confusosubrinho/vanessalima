
-- Also allow guest users to insert order_items for their orders (via access_token)
DROP POLICY IF EXISTS "Authenticated users can create order items" ON public.order_items;

CREATE POLICY "Anyone can create order items"
ON public.order_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
    AND (
      (orders.user_id = auth.uid())
      OR (orders.user_id IS NULL AND orders.access_token IS NOT NULL)
      OR is_admin()
    )
  )
);
