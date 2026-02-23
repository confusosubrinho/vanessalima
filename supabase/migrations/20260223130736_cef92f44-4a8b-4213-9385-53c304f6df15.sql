
-- =============================================
-- FASE 1: Base Multi-ambiente Appmax
-- =============================================

-- 1) Reestruturar appmax_settings para multiambiente
-- Adicionar novos campos
ALTER TABLE public.appmax_settings
  ADD COLUMN IF NOT EXISTS client_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS base_auth_url text,
  ADD COLUMN IF NOT EXISTS base_api_url text,
  ADD COLUMN IF NOT EXISTS base_portal_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

-- Migrar dados existentes de client_secret para client_secret_encrypted (plaintext por enquanto, será criptografado pela app)
UPDATE public.appmax_settings
SET client_secret_encrypted = client_secret
WHERE client_secret IS NOT NULL AND client_secret_encrypted IS NULL;

-- Tornar environment UNIQUE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appmax_settings_environment_key'
  ) THEN
    ALTER TABLE public.appmax_settings ADD CONSTRAINT appmax_settings_environment_key UNIQUE (environment);
  END IF;
END $$;

-- 2) Criar tabela appmax_tokens_cache
CREATE TABLE IF NOT EXISTS public.appmax_tokens_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL UNIQUE,
  access_token_encrypted text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appmax_tokens_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage appmax_tokens_cache"
  ON public.appmax_tokens_cache FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Admins can view appmax_tokens_cache"
  ON public.appmax_tokens_cache FOR SELECT
  USING (is_admin());

-- 3) Atualizar appmax_installations para ter client_secret_encrypted
ALTER TABLE public.appmax_installations
  ADD COLUMN IF NOT EXISTS merchant_client_secret_encrypted text;

-- Migrar dados existentes
UPDATE public.appmax_installations
SET merchant_client_secret_encrypted = merchant_client_secret
WHERE merchant_client_secret IS NOT NULL AND merchant_client_secret_encrypted IS NULL;

-- 4) Trigger de updated_at para tokens_cache
CREATE TRIGGER update_appmax_tokens_cache_updated_at
  BEFORE UPDATE ON public.appmax_tokens_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
