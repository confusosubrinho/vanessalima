
-- =============================================
-- 1. integrations_checkout (singleton config)
-- =============================================
CREATE TABLE public.integrations_checkout (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'native',
  fallback_to_native boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.integrations_checkout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage integrations_checkout" ON public.integrations_checkout FOR ALL USING (is_admin());
CREATE POLICY "Anyone can read integrations_checkout" ON public.integrations_checkout FOR SELECT USING (true);

-- Insert default row
INSERT INTO public.integrations_checkout (enabled, provider, fallback_to_native) VALUES (false, 'native', true);

-- =============================================
-- 2. integrations_checkout_providers
-- =============================================
CREATE TABLE public.integrations_checkout_providers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.integrations_checkout_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage checkout providers" ON public.integrations_checkout_providers FOR ALL USING (is_admin());
CREATE POLICY "Anyone can read checkout providers" ON public.integrations_checkout_providers FOR SELECT USING (true);

-- Insert Yampi as default provider
INSERT INTO public.integrations_checkout_providers (provider, display_name, is_active, config) VALUES (
  'yampi',
  'Yampi Checkout Transparente',
  false,
  '{"alias":"","user_token":"","user_secret_key":"","checkout_name_template":"Pedido #{order_number}","success_url":"","cancel_url":"","mode":"redirect","sync_enabled":true,"stock_mode":"reserve"}'::jsonb
);

-- =============================================
-- 3. integrations_checkout_test_logs
-- =============================================
CREATE TABLE public.integrations_checkout_test_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  payload_preview jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.integrations_checkout_test_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage test logs" ON public.integrations_checkout_test_logs FOR ALL USING (is_admin());
CREATE POLICY "Service can insert test logs" ON public.integrations_checkout_test_logs FOR INSERT WITH CHECK (true);

-- =============================================
-- 4. payments table
-- =============================================
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  gateway text,
  transaction_id text,
  installments integer DEFAULT 1,
  amount numeric NOT NULL DEFAULT 0,
  raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payments" ON public.payments FOR ALL USING (is_admin());
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = payments.order_id AND (orders.user_id = auth.uid() OR is_admin()))
);
CREATE POLICY "Service can insert payments" ON public.payments FOR INSERT WITH CHECK (true);

-- =============================================
-- 5. inventory_movements table
-- =============================================
CREATE TABLE public.inventory_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  type text NOT NULL, -- reserve, debit, release, refund
  quantity integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage inventory movements" ON public.inventory_movements FOR ALL USING (is_admin());
CREATE POLICY "Service can insert inventory movements" ON public.inventory_movements FOR INSERT WITH CHECK (true);

-- =============================================
-- 6. Add columns to products
-- =============================================
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS yampi_product_id bigint;

-- =============================================
-- 7. Add columns to product_variants
-- =============================================
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS yampi_sku_id bigint;

-- =============================================
-- 8. Add columns to orders for checkout provider tracking
-- =============================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS provider text DEFAULT 'native';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS external_reference text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS installments integer DEFAULT 1;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gateway text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_term text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referrer text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS landing_page text;

-- =============================================
-- 9. Add image_snapshot and title_snapshot to order_items
-- =============================================
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS title_snapshot text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS image_snapshot text;

-- =============================================
-- 10. Triggers for updated_at
-- =============================================
CREATE TRIGGER update_integrations_checkout_updated_at
  BEFORE UPDATE ON public.integrations_checkout
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integrations_checkout_providers_updated_at
  BEFORE UPDATE ON public.integrations_checkout_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
