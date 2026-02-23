
-- Add dynamic callback URL fields to store_settings
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS public_base_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS appmax_callback_path TEXT DEFAULT '/admin/integrations/appmax/callback';
