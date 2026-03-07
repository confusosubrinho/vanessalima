-- Add missing columns to stripe_webhook_events for webhook tracking
ALTER TABLE public.stripe_webhook_events ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE public.stripe_webhook_events ADD COLUMN IF NOT EXISTS error_message text;