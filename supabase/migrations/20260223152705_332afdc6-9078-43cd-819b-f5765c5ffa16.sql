
-- Create the unified home page sections table
CREATE TABLE public.home_page_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL UNIQUE,
  section_type TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.home_page_sections ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage home_page_sections"
  ON public.home_page_sections FOR ALL
  USING (is_admin());

-- Public can view active sections
CREATE POLICY "Anyone can view active home_page_sections"
  ON public.home_page_sections FOR SELECT
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_home_page_sections_updated_at
  BEFORE UPDATE ON public.home_page_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with existing sections
INSERT INTO public.home_page_sections (section_key, section_type, label, display_order, is_active) VALUES
  ('banner_carousel',      'banner_carousel',    'Carrossel de Banners',    0, true),
  ('features_bar',         'features_bar',       'Barra de Diferenciais',   1, true),
  ('category_grid',        'category_grid',      'Grid de Categorias',      2, true),
  ('product_sections',     'product_sections',   'Seções de Produtos',      3, true),
  ('highlight_banners',    'highlight_banners',  'Banners de Destaque',     4, true),
  ('shop_by_size',         'shop_by_size',       'Compre por Tamanho',      5, true),
  ('instagram_feed',       'instagram_feed',     'Feed do Instagram',       6, true),
  ('customer_testimonials','testimonials',       'Avaliações de Clientes',  7, true),
  ('newsletter',           'newsletter',         'Newsletter',              8, true);
