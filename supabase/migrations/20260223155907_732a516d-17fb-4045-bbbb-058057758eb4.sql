
-- =============================================
-- PART 1: Admin Notifications table + triggers
-- =============================================
CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage notifications" ON public.admin_notifications FOR ALL USING (is_admin());

CREATE INDEX idx_admin_notifications_is_read ON public.admin_notifications(is_read);
CREATE INDEX idx_admin_notifications_created_at ON public.admin_notifications(created_at DESC);

-- Trigger: new order
CREATE OR REPLACE FUNCTION public.notify_new_order() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, message, link, metadata)
  VALUES (
    'new_order',
    'Novo pedido recebido',
    'Pedido #' || NEW.order_number || ' — R$ ' || NEW.total_amount::text,
    '/admin/pedidos',
    jsonb_build_object('order_id', NEW.id, 'amount', NEW.total_amount)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_new_order
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();

-- Trigger: new review
CREATE OR REPLACE FUNCTION public.notify_new_review() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, message, link, metadata)
  VALUES (
    'new_review',
    'Nova avaliação publicada',
    NEW.customer_name || ' avaliou um produto com ' || NEW.rating || ' estrelas',
    '/admin/avaliacoes',
    jsonb_build_object('review_id', NEW.id, 'rating', NEW.rating)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_new_review
  AFTER INSERT ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_review();

-- Trigger: zero stock
CREATE OR REPLACE FUNCTION public.notify_zero_stock() RETURNS trigger AS $$
BEGIN
  IF NEW.stock_quantity = 0 AND OLD.stock_quantity > 0 THEN
    INSERT INTO public.admin_notifications (type, title, message, link, metadata)
    VALUES (
      'low_stock',
      'Produto sem estoque',
      'Uma variante ficou sem estoque. Verifique seus produtos.',
      '/admin/produtos',
      jsonb_build_object('variant_id', NEW.id, 'product_id', NEW.product_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_zero_stock
  AFTER UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.notify_zero_stock();

-- =============================================
-- PART 2: home_page_sections - add icon + is_native columns
-- =============================================
ALTER TABLE public.home_page_sections
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'Layout',
  ADD COLUMN IF NOT EXISTS is_native BOOLEAN DEFAULT true;

-- Update existing sections with icons
UPDATE public.home_page_sections SET icon = 'Image' WHERE section_key = 'banner_carousel';
UPDATE public.home_page_sections SET icon = 'CheckCircle' WHERE section_key = 'features_bar';
UPDATE public.home_page_sections SET icon = 'Grid' WHERE section_key = 'category_grid';
UPDATE public.home_page_sections SET icon = 'ShoppingBag' WHERE section_key = 'product_sections';
UPDATE public.home_page_sections SET icon = 'Layout' WHERE section_key = 'highlight_banners';
UPDATE public.home_page_sections SET icon = 'Ruler' WHERE section_key = 'shop_by_size';
UPDATE public.home_page_sections SET icon = 'Instagram' WHERE section_key = 'instagram_feed';
UPDATE public.home_page_sections SET icon = 'Star' WHERE section_key = 'testimonials';
UPDATE public.home_page_sections SET icon = 'Mail' WHERE section_key = 'newsletter';

-- =============================================
-- PART 3: Product Reviews - status + admin_reply
-- =============================================
ALTER TABLE public.product_reviews 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS admin_reply TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_product_reviews_status ON public.product_reviews(status);

-- =============================================
-- PART 4: Announcement Bar
-- =============================================
CREATE TABLE public.announcement_bar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active BOOLEAN DEFAULT false,
  messages JSONB DEFAULT '[{"text": "Frete grátis acima de R$ 299", "link": null}]'::jsonb,
  bg_color TEXT DEFAULT '#1a1a2e',
  text_color TEXT DEFAULT '#ffffff',
  font_size TEXT DEFAULT 'sm',
  autoplay BOOLEAN DEFAULT true,
  autoplay_speed INTEGER DEFAULT 4,
  closeable BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.announcement_bar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view announcement" ON public.announcement_bar FOR SELECT USING (true);
CREATE POLICY "Admins can manage announcement" ON public.announcement_bar FOR ALL USING (is_admin());
INSERT INTO public.announcement_bar (id) VALUES (gen_random_uuid());
