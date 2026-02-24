ALTER TABLE public.payment_pricing_config
  ADD COLUMN IF NOT EXISTS pix_discount_applies_to_sale_products boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.payment_pricing_config.pix_discount_applies_to_sale_products IS
  'Quando true (padrão), o desconto PIX vale para todos os produtos. Quando false, o desconto PIX não é aplicado a produtos que já tenham preço promocional (sale_price).';