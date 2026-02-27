-- Invariantes e constraints para impedir dados inválidos (QA hardening)

-- orders: total_amount e valores não negativos
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS chk_orders_total_amount_non_negative,
  DROP CONSTRAINT IF EXISTS chk_orders_subtotal_non_negative,
  DROP CONSTRAINT IF EXISTS chk_orders_shipping_non_negative,
  DROP CONSTRAINT IF EXISTS chk_orders_discount_non_negative;

ALTER TABLE public.orders
  ADD CONSTRAINT chk_orders_total_amount_non_negative CHECK (total_amount >= 0),
  ADD CONSTRAINT chk_orders_subtotal_non_negative CHECK (subtotal >= 0),
  ADD CONSTRAINT chk_orders_shipping_non_negative CHECK (shipping_cost >= 0),
  ADD CONSTRAINT chk_orders_discount_non_negative CHECK (discount_amount >= 0);

-- order_items: quantity e preços positivos
ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS chk_order_items_quantity_positive,
  DROP CONSTRAINT IF EXISTS chk_order_items_unit_price_non_negative,
  DROP CONSTRAINT IF EXISTS chk_order_items_total_price_non_negative;

ALTER TABLE public.order_items
  ADD CONSTRAINT chk_order_items_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT chk_order_items_unit_price_non_negative CHECK (unit_price >= 0),
  ADD CONSTRAINT chk_order_items_total_price_non_negative CHECK (total_price >= 0);

-- payments: amount não negativo
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS chk_payments_amount_non_negative;

ALTER TABLE public.payments
  ADD CONSTRAINT chk_payments_amount_non_negative CHECK (amount >= 0);

-- product_variants: stock não negativo
ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS chk_product_variants_stock_non_negative;

ALTER TABLE public.product_variants
  ADD CONSTRAINT chk_product_variants_stock_non_negative CHECK (stock_quantity >= 0);
