-- P0-1: One active checkout per cart. cart_id is stable across tabs (localStorage).
-- Ensures at most one order per cart in pending/processing.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cart_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_cart_id_active
  ON public.orders (cart_id)
  WHERE cart_id IS NOT NULL AND status IN ('pending', 'processing');

COMMENT ON COLUMN public.orders.cart_id IS 'Stable cart/session id from client (localStorage). Enforces one active checkout per cart.';
