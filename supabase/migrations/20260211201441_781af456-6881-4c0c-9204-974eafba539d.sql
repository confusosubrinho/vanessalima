
-- Add Appmax-specific columns to orders table
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS appmax_customer_id text,
  ADD COLUMN IF NOT EXISTS appmax_order_id text,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS last_webhook_event text;

-- Index for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_orders_appmax_order_id ON public.orders (appmax_order_id);

-- Create order_events table for webhook idempotency
CREATE TABLE IF NOT EXISTS public.order_events (
  id bigserial PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  appmax_order_id text,
  event_type text NOT NULL,
  event_hash text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  received_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_appmax_order_id ON public.order_events (appmax_order_id);

-- RLS for order_events (only service role should write, admins can read)
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view order events"
  ON public.order_events
  FOR SELECT
  USING (is_admin());

CREATE POLICY "Service role inserts order events"
  ON public.order_events
  FOR INSERT
  WITH CHECK (true);

-- Enable Realtime on orders table for status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
