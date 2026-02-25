
-- Add favicon_url to store_settings
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS favicon_url text;

COMMENT ON COLUMN public.store_settings.favicon_url IS 'URL do favicon personalizado da loja';
