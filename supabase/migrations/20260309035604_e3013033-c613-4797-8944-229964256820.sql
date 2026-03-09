
-- Harden INSERT policies on order_events and stripe_webhook_events
DROP POLICY IF EXISTS "Service can insert order events" ON public.order_events;
CREATE POLICY "Service can insert order events"
  ON public.order_events FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Service can insert stripe webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Service can insert stripe webhook events"
  ON public.stripe_webhook_events FOR INSERT
  WITH CHECK (is_admin());
