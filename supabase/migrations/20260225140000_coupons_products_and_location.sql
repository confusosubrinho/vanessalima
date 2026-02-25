-- Coupons: restrict by products and/or location (states, CEP prefixes)
-- Null/empty = no restriction (valid for all)

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS applicable_product_ids UUID[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS applicable_states TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS applicable_zip_prefixes TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.coupons.applicable_product_ids IS 'If set, coupon applies only to these product IDs';
COMMENT ON COLUMN public.coupons.applicable_states IS 'If set, coupon valid only for shipping to these UFs (e.g. SP, RJ)';
COMMENT ON COLUMN public.coupons.applicable_zip_prefixes IS 'If set, coupon valid only for CEPs starting with these 5-digit prefixes';
