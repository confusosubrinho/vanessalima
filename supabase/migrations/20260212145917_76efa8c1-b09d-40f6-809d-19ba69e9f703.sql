-- Bug #9: Add base_price and sale_price columns to product_variants
-- These allow variant-specific pricing independent of parent product
ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS base_price numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sale_price numeric DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN public.product_variants.base_price IS 'Optional variant-specific base price. If null, uses parent product price + price_modifier.';
COMMENT ON COLUMN public.product_variants.sale_price IS 'Optional variant-specific sale price. If null, uses parent product sale_price.';