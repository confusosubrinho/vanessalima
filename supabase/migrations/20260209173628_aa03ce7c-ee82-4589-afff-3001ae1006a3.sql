-- Add Bling OAuth2 columns to store_settings
ALTER TABLE public.store_settings 
ADD COLUMN IF NOT EXISTS bling_client_id text,
ADD COLUMN IF NOT EXISTS bling_client_secret text,
ADD COLUMN IF NOT EXISTS bling_access_token text,
ADD COLUMN IF NOT EXISTS bling_refresh_token text,
ADD COLUMN IF NOT EXISTS bling_token_expires_at timestamptz;