-- Stripe Catalog Sync: store Stripe Product and Price IDs for synced catalog
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stripe_product_id text;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS stripe_price_id text;

COMMENT ON COLUMN public.products.stripe_product_id IS 'Stripe Product ID (prod_xxx) when synced to Stripe Catalog';
COMMENT ON COLUMN public.product_variants.stripe_price_id IS 'Stripe Price ID (price_xxx) when synced to Stripe Catalog';
