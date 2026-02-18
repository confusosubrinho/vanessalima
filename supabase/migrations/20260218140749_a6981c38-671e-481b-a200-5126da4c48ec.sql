
-- Bling sync configuration (single row)
CREATE TABLE public.bling_sync_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_new_products boolean NOT NULL DEFAULT true,
  merge_by_sku boolean NOT NULL DEFAULT true,
  sync_stock boolean NOT NULL DEFAULT true,
  sync_titles boolean NOT NULL DEFAULT false,
  sync_descriptions boolean NOT NULL DEFAULT false,
  sync_images boolean NOT NULL DEFAULT false,
  sync_prices boolean NOT NULL DEFAULT false,
  sync_dimensions boolean NOT NULL DEFAULT false,
  sync_sku_gtin boolean NOT NULL DEFAULT false,
  sync_variant_active boolean NOT NULL DEFAULT false,
  first_import_done boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bling_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bling_sync_config" ON public.bling_sync_config FOR ALL USING (is_admin());
CREATE POLICY "Anyone can view bling_sync_config" ON public.bling_sync_config FOR SELECT USING (true);

-- Insert default config row
INSERT INTO public.bling_sync_config (id) VALUES (gen_random_uuid());

-- Trigger for updated_at
CREATE TRIGGER update_bling_sync_config_updated_at
  BEFORE UPDATE ON public.bling_sync_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
