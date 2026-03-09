
-- Blog settings (singleton)
CREATE TABLE public.blog_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT false,
  posts_per_page integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage blog_settings" ON public.blog_settings FOR ALL USING (is_admin());
CREATE POLICY "Anyone can read blog_settings" ON public.blog_settings FOR SELECT USING (true);

-- Insert default row
INSERT INTO public.blog_settings (is_active) VALUES (false);

-- Blog posts
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content text,
  featured_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  seo_title text,
  seo_description text,
  -- Future-ready columns
  author_name text,
  category_tag text,
  tags text[] DEFAULT '{}',
  display_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage blog_posts" ON public.blog_posts FOR ALL USING (is_admin());
CREATE POLICY "Anyone can read published blog_posts" ON public.blog_posts FOR SELECT USING (status = 'published');

-- Indexes
CREATE INDEX idx_blog_posts_slug ON public.blog_posts (slug);
CREATE INDEX idx_blog_posts_status ON public.blog_posts (status, published_at DESC);

-- updated_at trigger
CREATE TRIGGER update_blog_settings_updated_at BEFORE UPDATE ON public.blog_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
