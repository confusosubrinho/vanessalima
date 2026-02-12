
-- Tabela social_links
CREATE TABLE public.social_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  icon_type text NOT NULL DEFAULT 'default',
  icon_image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active social links" ON public.social_links
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage social links" ON public.social_links
  FOR ALL USING (is_admin());

CREATE TRIGGER update_social_links_updated_at
  BEFORE UPDATE ON public.social_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed com redes padrão
INSERT INTO public.social_links (name, url, icon_type, sort_order) VALUES
  ('Instagram', 'https://instagram.com/vanessalimashoes', 'default', 1),
  ('Facebook', 'https://facebook.com/vanessalimashoes', 'default', 2),
  ('WhatsApp', 'https://wa.me/5542991120205', 'default', 3);
