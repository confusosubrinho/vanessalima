ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS custom_attribute_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_attribute_value text DEFAULT NULL;