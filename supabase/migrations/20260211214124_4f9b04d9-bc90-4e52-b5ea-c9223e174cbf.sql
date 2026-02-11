
-- #1: CRITICAL - Restrict SELECT on store_settings (exposes API tokens)
-- The view store_settings_public already exists but we need to ensure base table SELECT is restricted
-- Drop existing permissive public SELECT policies on store_settings
DROP POLICY IF EXISTS "Public Read" ON public.store_settings;
DROP POLICY IF EXISTS "Public view settings read only" ON public.store_settings;

-- Create a restrictive policy: only admins can SELECT from the base table
CREATE POLICY "Only admins can read store_settings"
  ON public.store_settings FOR SELECT
  USING (is_admin());

-- #2: CRITICAL - Restrict SELECT on abandoned_carts (exposes customer PII)
DROP POLICY IF EXISTS "Users can view own abandoned carts" ON public.abandoned_carts;

CREATE POLICY "Users can view own abandoned carts"
  ON public.abandoned_carts FOR SELECT
  USING (
    (user_id = auth.uid()) OR is_admin()
  );

-- #6: MEDIUM - Restrict INSERT on orders to authenticated users only
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;

CREATE POLICY "Authenticated users can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- #6: MEDIUM - Restrict INSERT on order_events to service role only (remove public insert)
DROP POLICY IF EXISTS "Service role inserts order events" ON public.order_events;

-- order_events should only be insertable by service_role (edge functions)
-- No anon/authenticated INSERT policy needed since webhooks use service_role key
