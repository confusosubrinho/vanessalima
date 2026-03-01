
-- Allow guest users to update their own orders via access_token match
CREATE POLICY "Guest users can update own orders"
ON public.orders
FOR UPDATE
USING (
  auth.uid() IS NULL 
  AND user_id IS NULL 
  AND access_token IS NOT NULL
  AND access_token = current_setting('request.headers', true)::jsonb->>'x-order-token'
)
WITH CHECK (
  auth.uid() IS NULL 
  AND user_id IS NULL 
  AND access_token IS NOT NULL
);
