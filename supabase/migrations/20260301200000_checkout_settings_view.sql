-- PR5: View unificada checkout_settings — só cria quando a tabela canônica PR8 não existe (compat com ambientes sem PR8).
-- Quando checkout_settings_canonical existe, a view já foi criada pela migration PR8 (apontando para a canônica).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'checkout_settings_canonical'
  ) THEN
    CREATE OR REPLACE VIEW public.checkout_settings AS
    SELECT
      c.id,
      c.enabled,
      c.provider AS active_provider,
      c.fallback_to_native,
      c.updated_at,
      (p.config->>'checkout_mode')::text AS checkout_mode,
      CASE
        WHEN c.provider IN ('appmax', 'native') THEN 'transparent'::text
        WHEN c.provider = 'stripe' AND (p.config->>'checkout_mode') = 'external' THEN 'gateway'::text
        WHEN c.provider = 'stripe' THEN 'transparent'::text
        WHEN c.provider = 'yampi' THEN 'gateway'::text
        ELSE 'transparent'::text
      END AS experience
    FROM public.integrations_checkout c
    LEFT JOIN public.integrations_checkout_providers p
      ON p.provider = c.provider AND p.is_active = true;

    COMMENT ON VIEW public.checkout_settings IS 'PR5: Configuração unificada de checkout (legado). Fonte: integrations_checkout + integrations_checkout_providers.';

    GRANT SELECT ON public.checkout_settings TO anon;
    GRANT SELECT ON public.checkout_settings TO authenticated;
    GRANT SELECT ON public.checkout_settings TO service_role;
  END IF;
END $$;
