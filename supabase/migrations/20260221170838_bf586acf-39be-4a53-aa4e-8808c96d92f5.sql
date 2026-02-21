
-- Add external_id column
ALTER TABLE public.appmax_installations
  ADD COLUMN IF NOT EXISTS external_id text;

-- Rename installation_token to authorize_token
ALTER TABLE public.appmax_installations
  RENAME COLUMN installation_token TO authorize_token;

-- Create a secure view that excludes merchant_client_secret
CREATE OR REPLACE VIEW public.appmax_installations_safe AS
  SELECT id, external_key, environment, status, authorize_token,
         merchant_client_id, external_id, last_error, created_at, updated_at
  FROM public.appmax_installations;
