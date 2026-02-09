-- Add banner image to categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS banner_image_url text;

-- Create product characteristics table
CREATE TABLE public.product_characteristics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_characteristics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view product characteristics"
  ON public.product_characteristics FOR SELECT USING (true);

CREATE POLICY "Admins can manage product characteristics"
  ON public.product_characteristics FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
