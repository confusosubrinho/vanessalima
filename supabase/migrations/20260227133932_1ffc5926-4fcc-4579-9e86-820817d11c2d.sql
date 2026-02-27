
-- 1) Create idempotency table for Stripe webhook events
CREATE TABLE public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NULL,
  processed boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_stripe_webhook_events_event_id ON public.stripe_webhook_events (event_id);

-- RLS
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can insert stripe webhook events"
  ON public.stripe_webhook_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view stripe webhook events"
  ON public.stripe_webhook_events FOR SELECT
  USING (is_admin());

-- 2) Add missing order_status enum values
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'disputed';

-- 3) Add stripe_charge_id column to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_charge_id text UNIQUE;
