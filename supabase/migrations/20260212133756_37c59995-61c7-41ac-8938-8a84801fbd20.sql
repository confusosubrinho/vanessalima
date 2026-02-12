-- Table for webhook idempotency
CREATE TABLE public.bling_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  bling_product_id bigint,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  retries int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for processing pending events
CREATE INDEX idx_bling_webhook_events_status ON public.bling_webhook_events(status) WHERE status = 'pending';
CREATE INDEX idx_bling_webhook_events_event_id ON public.bling_webhook_events(event_id);

-- Cleanup old events (keep 30 days)
CREATE INDEX idx_bling_webhook_events_created ON public.bling_webhook_events(created_at);

-- Enable RLS
ALTER TABLE public.bling_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can manage (edge functions use service role key)
CREATE POLICY "Service role only" ON public.bling_webhook_events FOR ALL USING (false);

-- Admin read access
CREATE POLICY "Admins can view webhook events" ON public.bling_webhook_events FOR SELECT USING (is_admin());