
-- Table for testimonials configuration (section settings)
CREATE TABLE public.homepage_testimonials_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true,
  title text NOT NULL DEFAULT 'O que dizem sobre nós',
  subtitle text NOT NULL DEFAULT 'Confira alguns depoimentos reais',
  bg_color text NOT NULL DEFAULT '#f5f0eb',
  card_color text NOT NULL DEFAULT '#ffffff',
  star_color text NOT NULL DEFAULT '#f5a623',
  text_color text NOT NULL DEFAULT '#333333',
  cards_per_view integer NOT NULL DEFAULT 4,
  autoplay boolean NOT NULL DEFAULT true,
  autoplay_speed integer NOT NULL DEFAULT 5,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table for individual testimonials
CREATE TABLE public.homepage_testimonials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name text NOT NULL,
  rating integer NOT NULL DEFAULT 5,
  testimonial text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.homepage_testimonials_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_testimonials ENABLE ROW LEVEL SECURITY;

-- Config policies
CREATE POLICY "Anyone can view testimonials config" ON public.homepage_testimonials_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage testimonials config" ON public.homepage_testimonials_config FOR ALL USING (is_admin());

-- Testimonials policies
CREATE POLICY "Anyone can view active testimonials" ON public.homepage_testimonials FOR SELECT USING (true);
CREATE POLICY "Admins can manage testimonials" ON public.homepage_testimonials FOR ALL USING (is_admin());

-- Insert default config row
INSERT INTO public.homepage_testimonials_config (id) VALUES (gen_random_uuid());

-- Triggers for updated_at
CREATE TRIGGER update_homepage_testimonials_config_updated_at
  BEFORE UPDATE ON public.homepage_testimonials_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_homepage_testimonials_updated_at
  BEFORE UPDATE ON public.homepage_testimonials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
