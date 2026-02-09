
-- Add video_url to products for floating video
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_url text;

-- Buy together configurable per product
CREATE TABLE IF NOT EXISTS public.buy_together_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  related_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  discount_percent numeric DEFAULT 5,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(product_id, related_product_id)
);

ALTER TABLE public.buy_together_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view buy together" ON public.buy_together_products FOR SELECT USING (true);
CREATE POLICY "Admins can manage buy together" ON public.buy_together_products FOR ALL USING (is_admin());

-- Instagram videos table for the video carousel
CREATE TABLE IF NOT EXISTS public.instagram_videos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_url text NOT NULL,
  thumbnail_url text,
  username text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active instagram videos" ON public.instagram_videos FOR SELECT USING (true);
CREATE POLICY "Admins can manage instagram videos" ON public.instagram_videos FOR ALL USING (is_admin());
