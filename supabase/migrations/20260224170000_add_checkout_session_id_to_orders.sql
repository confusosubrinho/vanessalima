-- Add checkout_session_id to reliably match external checkout returns (Yampi)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_checkout_session_id
  ON public.orders (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

