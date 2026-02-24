-- Parcelas sem juros específicas para produtos em promoção (quando menor que o valor geral).
-- Se preenchido, produtos com preço promocional usam este valor em vez de interest_free_installments.
ALTER TABLE public.payment_pricing_config
  ADD COLUMN IF NOT EXISTS interest_free_installments_sale integer DEFAULT NULL;

COMMENT ON COLUMN public.payment_pricing_config.interest_free_installments_sale IS
  'When set, products on sale (sale_price) show this many interest-free installments instead of interest_free_installments. E.g. 3 for sale vs 5 normal.';
