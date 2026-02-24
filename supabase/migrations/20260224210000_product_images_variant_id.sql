-- Link product image to variant: when set, this image is the main image for that variant (used on store when variant is selected)
ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS product_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.product_images.product_variant_id IS 'When set, this image is shown as the main product image when the user selects this variant on the store.';

CREATE INDEX IF NOT EXISTS idx_product_images_product_variant_id
  ON public.product_images (product_variant_id) WHERE product_variant_id IS NOT NULL;
