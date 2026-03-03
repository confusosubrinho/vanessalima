ALTER TABLE public.payment_pricing_config
  ADD COLUMN IF NOT EXISTS interest_free_installments_sale integer DEFAULT NULL;

COMMENT ON COLUMN public.payment_pricing_config.interest_free_installments_sale IS
  'When set, products on sale use this number of interest-free installments instead of the default';