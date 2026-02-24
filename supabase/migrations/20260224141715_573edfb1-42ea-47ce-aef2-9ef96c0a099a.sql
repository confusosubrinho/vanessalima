-- Add yampi_category_id to categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS yampi_category_id bigint;

-- Create variation_value_map table
CREATE TABLE IF NOT EXISTS public.variation_value_map (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('color', 'size', 'custom')),
  value text NOT NULL,
  yampi_variation_id bigint,
  yampi_value_id bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(type, value)
);

ALTER TABLE public.variation_value_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage variation_value_map" ON public.variation_value_map FOR ALL USING (is_admin());
CREATE POLICY "Service can insert variation_value_map" ON public.variation_value_map FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update variation_value_map" ON public.variation_value_map FOR UPDATE USING (true);
