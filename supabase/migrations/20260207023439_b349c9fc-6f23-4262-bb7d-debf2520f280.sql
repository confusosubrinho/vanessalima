-- Add melhor_envio_token to store_settings for shipping integration
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS melhor_envio_token TEXT;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS melhor_envio_sandbox BOOLEAN DEFAULT true;