
-- Add gateway fee columns to payment_pricing_config
ALTER TABLE public.payment_pricing_config
  ADD COLUMN IF NOT EXISTS gateway_fee_1x_percent numeric NOT NULL DEFAULT 4.99,
  ADD COLUMN IF NOT EXISTS gateway_fee_additional_per_installment_percent numeric NOT NULL DEFAULT 2.49,
  ADD COLUMN IF NOT EXISTS gateway_fee_starts_at_installment integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS gateway_fee_mode text NOT NULL DEFAULT 'linear_per_installment';
