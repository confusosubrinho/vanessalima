
-- BUG #1: Fix order number collision with sequence
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1000;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  store_prefix TEXT;
  seq_val BIGINT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(store_name), ''), 'PED') INTO store_prefix
  FROM public.store_settings LIMIT 1;

  store_prefix := UPPER(LEFT(REGEXP_REPLACE(COALESCE(store_prefix, 'PED'), '[^A-Za-z]', '', 'g'), 3));
  IF store_prefix = '' THEN store_prefix := 'PED'; END IF;

  seq_val := NEXTVAL('public.order_number_seq');
  NEW.order_number := store_prefix || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(seq_val::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS set_order_number ON public.orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

-- BUG #2: Create missing increment_stock function
CREATE OR REPLACE FUNCTION public.increment_stock(
  p_variant_id uuid,
  p_quantity integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  current_stock integer;
BEGIN
  UPDATE public.product_variants
  SET stock_quantity = stock_quantity + p_quantity
  WHERE id = p_variant_id
  RETURNING stock_quantity INTO current_stock;

  IF current_stock IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'variant_not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_stock', current_stock);
END;
$$;

-- BUG #6: Add access_token for guest orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS access_token TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_access_token ON public.orders (access_token) WHERE access_token IS NOT NULL;

-- BUG #7: Add dedicated PII columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_cpf TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders (customer_email);

-- Migrate existing PII from notes
UPDATE public.orders SET
  customer_email = (REGEXP_MATCH(notes, 'Email: ([^\s|]+)'))[1],
  customer_cpf = (REGEXP_MATCH(notes, 'CPF: ([0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})'))[1]
WHERE notes IS NOT NULL AND customer_email IS NULL;

-- Clean PII from notes
UPDATE public.orders SET
  notes = NULLIF(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(COALESCE(notes,''), 'CPF: [^\|]+\|?\s*', '', 'g'),
      'Email: [^\|]+\|?\s*', '', 'g'
    )
  ), '')
WHERE notes IS NOT NULL AND notes LIKE '%CPF:%';

-- BUG #9: Add idempotency_key
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON public.orders (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- IMPROVEMENT #1: Cleanup orphan orders function
CREATE OR REPLACE FUNCTION public.cleanup_orphan_orders()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'cancelled',
      notes = COALESCE(notes, '') || ' | AUTO-CANCELADO: sem pagamento após 2h'
  WHERE status = 'pending'
    AND appmax_order_id IS NULL
    AND created_at < NOW() - INTERVAL '2 hours';
END;
$$;

-- Update RLS for guest access via access_token
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
FOR SELECT USING (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR is_admin()
  OR (access_token IS NOT NULL AND access_token = current_setting('request.headers', true)::jsonb->>'x-order-token')
);
