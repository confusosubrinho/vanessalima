
-- 1) Fix payments index: drop non-unique and recreate as UNIQUE
DROP INDEX IF EXISTS public.idx_payments_provider_transaction_id;
CREATE UNIQUE INDEX idx_payments_provider_transaction_id
  ON public.payments (provider, transaction_id)
  WHERE transaction_id IS NOT NULL;

-- 2) QA Constraints & Invariants
-- orders.cart_id unique (for two-tabs protection)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_cart_id_unique
  ON public.orders (cart_id)
  WHERE cart_id IS NOT NULL;

-- orders.idempotency_key unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key_unique
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Validation trigger: orders.total_amount > 0
CREATE OR REPLACE FUNCTION public.validate_order_total_positive()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_amount <= 0 THEN
    RAISE EXCEPTION 'total_amount must be positive, got %', NEW.total_amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_order_total ON public.orders;
CREATE TRIGGER trg_validate_order_total
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_total_positive();

-- Validation trigger: order_items.quantity > 0
CREATE OR REPLACE FUNCTION public.validate_order_item_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'order_items.quantity must be positive, got %', NEW.quantity;
  END IF;
  IF NEW.unit_price < 0 THEN
    RAISE EXCEPTION 'order_items.unit_price must be non-negative, got %', NEW.unit_price;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_order_item ON public.order_items;
CREATE TRIGGER trg_validate_order_item
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_quantity();

-- Validation trigger: payments.amount > 0
CREATE OR REPLACE FUNCTION public.validate_payment_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'payments.amount must be positive, got %', NEW.amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_payment_amount ON public.payments;
CREATE TRIGGER trg_validate_payment_amount
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_amount();

-- Validation trigger: product_variants.stock_quantity >= 0
CREATE OR REPLACE FUNCTION public.validate_stock_nonneg()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_quantity < 0 THEN
    RAISE EXCEPTION 'stock_quantity cannot be negative, got %', NEW.stock_quantity;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_stock_nonneg ON public.product_variants;
CREATE TRIGGER trg_validate_stock_nonneg
  BEFORE INSERT OR UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.validate_stock_nonneg();
