ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS product_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.product_images.product_variant_id IS 'Quando preenchido, esta imagem é exibida como principal ao selecionar essa variante na loja.';

CREATE INDEX IF NOT EXISTS idx_product_images_product_variant_id
  ON public.product_images (product_variant_id) WHERE product_variant_id IS NOT NULL;