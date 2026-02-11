
-- Features bar items (the horizontal strip with icons)
CREATE TABLE public.features_bar (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  icon_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.features_bar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view features_bar" ON public.features_bar FOR SELECT USING (true);
CREATE POLICY "Admins can manage features_bar" ON public.features_bar FOR ALL USING (is_admin());

-- Payment methods logos for footer
CREATE TABLE public.payment_methods_display (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  link_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_methods_display ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payment_methods_display" ON public.payment_methods_display FOR SELECT USING (true);
CREATE POLICY "Admins can manage payment_methods_display" ON public.payment_methods_display FOR ALL USING (is_admin());

-- Security seals for footer
CREATE TABLE public.security_seals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  image_url TEXT,
  html_code TEXT,
  link_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_seals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view security_seals" ON public.security_seals FOR SELECT USING (true);
CREATE POLICY "Admins can manage security_seals" ON public.security_seals FOR ALL USING (is_admin());

-- Institutional page contents
CREATE TABLE public.page_contents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_slug TEXT NOT NULL UNIQUE,
  page_title TEXT NOT NULL,
  content TEXT,
  meta_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.page_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view page_contents" ON public.page_contents FOR SELECT USING (true);
CREATE POLICY "Admins can manage page_contents" ON public.page_contents FOR ALL USING (is_admin());

-- Seed default features bar
INSERT INTO public.features_bar (title, subtitle, icon_url, display_order) VALUES
  ('Parcelamento', 'Em até 6x sem juros', null, 0),
  ('Envios', 'Enviamos para todo Brasil', null, 1),
  ('Atendimento', 'via WhatsApp', null, 2),
  ('Site 100% Seguro', 'Selo de segurança', null, 3),
  ('Desconto de 10%', 'cupom: PRIMEIRACOMPRA', null, 4);

-- Seed default payment methods
INSERT INTO public.payment_methods_display (name, display_order) VALUES
  ('Visa', 0), ('Mastercard', 1), ('Elo', 2), ('Hipercard', 3), ('Amex', 4), ('PIX', 5), ('Boleto', 6);

-- Seed default security seals
INSERT INTO public.security_seals (title, html_code, display_order) VALUES
  ('🔒 SSL', null, 0),
  ('✅ Google Safe', null, 1),
  ('🛡️ Compra Segura', null, 2);

-- Seed institutional pages
INSERT INTO public.page_contents (page_slug, page_title, content) VALUES
  ('sobre', 'Sobre a Vanessa Lima Shoes', ''),
  ('faq', 'Perguntas Frequentes', ''),
  ('politica-privacidade', 'Política de Privacidade', ''),
  ('termos', 'Termos de Uso', ''),
  ('trocas', 'Trocas e Devoluções', ''),
  ('como-comprar', 'Como Comprar', ''),
  ('formas-pagamento', 'Formas de Pagamento', ''),
  ('atendimento', 'Central de Atendimento', ''),
  ('rastreio', 'Rastrear Pedido', '');

-- Triggers for updated_at
CREATE TRIGGER update_features_bar_updated_at BEFORE UPDATE ON public.features_bar FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payment_methods_display_updated_at BEFORE UPDATE ON public.payment_methods_display FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_security_seals_updated_at BEFORE UPDATE ON public.security_seals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_page_contents_updated_at BEFORE UPDATE ON public.page_contents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
