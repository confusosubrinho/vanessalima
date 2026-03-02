-- PR3: stripe_webhook_events — status/erro para reprocesso e auditoria
ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS processed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS error_message text NULL;

COMMENT ON COLUMN public.stripe_webhook_events.processed_at IS 'When the event was finished processing (success or failure)';
COMMENT ON COLUMN public.stripe_webhook_events.error_message IS 'Error message if processing failed; NULL on success';

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
  ON public.stripe_webhook_events (processed_at)
  WHERE processed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_error
  ON public.stripe_webhook_events (event_id)
  WHERE error_message IS NOT NULL;
