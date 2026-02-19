
-- Create site_theme table (single-row config)
CREATE TABLE public.site_theme (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  primary_color text NOT NULL DEFAULT '#33cc99',
  primary_color_dark text NOT NULL DEFAULT '#2ba882',
  primary_color_light text NOT NULL DEFAULT '#e6f9f2',
  accent_color text NOT NULL DEFAULT '#1a1a1a',
  background_color text NOT NULL DEFAULT '#ffffff',
  text_color text NOT NULL DEFAULT '#1a1a1a',
  font_family text NOT NULL DEFAULT 'Maven Pro',
  font_heading text NOT NULL DEFAULT 'Maven Pro',
  border_radius text NOT NULL DEFAULT 'medium',
  shadow_intensity text NOT NULL DEFAULT 'medium',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_theme ENABLE ROW LEVEL SECURITY;

-- Anyone can read the theme (public storefront)
CREATE POLICY "Anyone can view site theme"
ON public.site_theme
FOR SELECT
USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage site theme"
ON public.site_theme
FOR ALL
USING (is_admin());

-- Seed default row
INSERT INTO public.site_theme (primary_color, primary_color_dark, primary_color_light, accent_color, background_color, text_color, font_family, font_heading)
VALUES ('#33cc99', '#2ba882', '#e6f9f2', '#1a1a1a', '#ffffff', '#1a1a1a', 'Maven Pro', 'Maven Pro');

-- Auto-update updated_at
CREATE TRIGGER update_site_theme_updated_at
BEFORE UPDATE ON public.site_theme
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
