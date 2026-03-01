
-- 1. Fix INSERT policy: remove auth.uid() IS NULL check from guest branch
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;

CREATE POLICY "Anyone can create orders" ON public.orders
FOR INSERT WITH CHECK (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR
  (user_id IS NULL AND access_token IS NOT NULL)
);

-- 2. Fix guest UPDATE policy: remove auth.uid() IS NULL check
DROP POLICY IF EXISTS "Guest users can update own orders" ON public.orders;

CREATE POLICY "Guest users can update own orders" ON public.orders
FOR UPDATE USING (
  user_id IS NULL AND access_token IS NOT NULL
) WITH CHECK (
  user_id IS NULL AND access_token IS NOT NULL
);

-- 3. Add logged-in user UPDATE policy
CREATE POLICY "Users can update own orders" ON public.orders
FOR UPDATE USING (
  user_id IS NOT NULL AND user_id = auth.uid()
) WITH CHECK (
  user_id IS NOT NULL AND user_id = auth.uid()
);
