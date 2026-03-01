
-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;

-- Create a new INSERT policy that allows both authenticated users and guest checkout
CREATE POLICY "Anyone can create orders"
ON public.orders
FOR INSERT
WITH CHECK (
  -- Authenticated user: user_id must match auth.uid()
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Guest checkout: user_id is null and access_token is provided
  (auth.uid() IS NULL AND user_id IS NULL AND access_token IS NOT NULL)
);
