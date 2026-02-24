-- Option to disable PIX discount on products that already have a sale (sale_price < base_price).
-- When false: PIX discount applies only to full-price items; sale products pay sale price via PIX without extra %.
ALTER TABLE public.payment_pricing_config
  ADD COLUMN IF NOT EXISTS pix_discount_applies_to_sale_products boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.payment_pricing_config.pix_discount_applies_to_sale_products IS
  'When true (default), PIX discount applies to all products. When false, PIX discount is not applied to products that already have a sale price (sale_price < base_price).';
