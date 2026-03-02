-- PR8: Source of Truth — tabela canônica checkout_settings_canonical (singleton) + view checkout_settings (compat) + audit
-- NÃO dropar a view sem substituir: recriamos a view com o mesmo nome apontando para a nova tabela.

-- =============================================
-- 1. Tabela public.checkout_settings_canonical (singleton)
-- =============================================
CREATE TABLE public.checkout_settings_canonical (
  id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  active_provider text NOT NULL CHECK (active_provider IN ('stripe', 'yampi', 'appmax')),
  channel text NOT NULL CHECK (channel IN ('internal', 'external')),
  experience text NOT NULL CHECK (experience IN ('transparent', 'native')),
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
  config_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  CONSTRAINT checkout_settings_canonical_singleton_id CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

-- Garantir singleton: apenas uma linha
CREATE UNIQUE INDEX checkout_settings_canonical_singleton ON public.checkout_settings_canonical ((true));

COMMENT ON TABLE public.checkout_settings_canonical IS 'PR8: Configuração canônica de checkout (source of truth). Uma única linha.';

ALTER TABLE public.checkout_settings_canonical ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read checkout_settings_canonical"
  ON public.checkout_settings_canonical FOR SELECT USING (true);

CREATE POLICY "Admins can manage checkout_settings_canonical"
  ON public.checkout_settings_canonical FOR ALL USING (is_admin());

-- =============================================
-- 2. Tabela public.checkout_settings_audit
-- =============================================
CREATE TABLE public.checkout_settings_audit (
  id bigserial PRIMARY KEY,
  settings_id uuid NOT NULL REFERENCES public.checkout_settings_canonical(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  change_reason text,
  request_id text
);

CREATE INDEX idx_checkout_settings_audit_settings_id ON public.checkout_settings_audit(settings_id);
CREATE INDEX idx_checkout_settings_audit_changed_at ON public.checkout_settings_audit(changed_at DESC);

COMMENT ON TABLE public.checkout_settings_audit IS 'PR8: Histórico de alterações de checkout_settings_canonical.';

ALTER TABLE public.checkout_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read checkout_settings_audit"
  ON public.checkout_settings_audit FOR SELECT USING (is_admin());

CREATE POLICY "Admins and service can insert checkout_settings_audit"
  ON public.checkout_settings_audit FOR INSERT WITH CHECK (is_admin() OR auth.jwt() ->> 'role' = 'service_role');

-- =============================================
-- 3. Trigger updated_at em checkout_settings_canonical
-- =============================================
CREATE TRIGGER update_checkout_settings_canonical_updated_at
  BEFORE UPDATE ON public.checkout_settings_canonical
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 4. Linha singleton default
-- =============================================
INSERT INTO public.checkout_settings_canonical (
  id, enabled, active_provider, channel, experience, environment, config_version, notes
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  true,
  'stripe',
  'internal',
  'native',
  'production',
  1,
  'Default PR8'
);

-- =============================================
-- 5. View public.checkout_settings (compat: mesmo nome, aponta para a tabela canônica)
-- =============================================
DROP VIEW IF EXISTS public.checkout_settings;
CREATE VIEW public.checkout_settings AS
  SELECT id, enabled, active_provider, channel, experience, environment, config_version, updated_at, updated_by, notes
  FROM public.checkout_settings_canonical;

COMMENT ON VIEW public.checkout_settings IS 'PR8: Vista de compatibilidade. Source of truth é checkout_settings_canonical.';

-- =============================================
-- 6. Grants
-- =============================================
GRANT SELECT ON public.checkout_settings_canonical TO anon;
GRANT SELECT ON public.checkout_settings_canonical TO authenticated;
GRANT ALL ON public.checkout_settings_canonical TO service_role;

GRANT SELECT ON public.checkout_settings TO anon;
GRANT SELECT ON public.checkout_settings TO authenticated;
GRANT SELECT ON public.checkout_settings TO service_role;

GRANT SELECT ON public.checkout_settings_audit TO authenticated;
GRANT ALL ON public.checkout_settings_audit TO service_role;
