
-- Add transparent checkout fee to payment_pricing_config
ALTER TABLE public.payment_pricing_config
  ADD COLUMN IF NOT EXISTS transparent_checkout_fee_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transparent_checkout_fee_enabled boolean NOT NULL DEFAULT false;
