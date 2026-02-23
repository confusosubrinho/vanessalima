
-- Clean up hardcoded store data
UPDATE public.store_settings SET 
  store_name = 'Minha Loja',
  free_shipping_threshold = 299,
  contact_email = '',
  contact_whatsapp = ''
WHERE store_name = 'Vanessa Lima Shoes' OR store_name IS NOT NULL;

-- Clean up hardcoded appmax URLs
UPDATE public.appmax_settings SET 
  callback_url = '',
  healthcheck_url = ''
WHERE callback_url LIKE '%vanessalima%' 
   OR healthcheck_url LIKE '%vanessalima%';

-- Create store_setup table for first-access wizard
CREATE TABLE IF NOT EXISTS public.store_setup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_completed BOOLEAN DEFAULT false,
  current_step INTEGER DEFAULT 1,
  completed_steps JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.store_setup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage setup" ON public.store_setup FOR ALL USING (is_admin());
CREATE POLICY "Anyone can view setup" ON public.store_setup FOR SELECT USING (true);

INSERT INTO public.store_setup (id) VALUES (gen_random_uuid());

-- Updated_at trigger
CREATE TRIGGER update_store_setup_updated_at
  BEFORE UPDATE ON public.store_setup
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
