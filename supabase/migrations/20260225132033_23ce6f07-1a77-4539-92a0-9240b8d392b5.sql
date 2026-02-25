
-- Add coupon location/product restrictions
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS applicable_product_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicable_states text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicable_zip_prefixes text[] DEFAULT '{}';

COMMENT ON COLUMN public.coupons.applicable_product_ids IS 'Lista de product IDs onde o cupom é válido (vazio = todos)';
COMMENT ON COLUMN public.coupons.applicable_states IS 'Lista de UFs onde o cupom é válido (vazio = todos)';
COMMENT ON COLUMN public.coupons.applicable_zip_prefixes IS 'Prefixos de CEP onde o cupom é válido (vazio = todos)';
