-- PR8: Seed checkout_settings_canonical a partir de integrations_checkout + integrations_checkout_providers
-- Idempotente: só atualiza quando existe config legada. Rodar 2x sem efeitos colaterais.
-- Defaults conservadores se integrações antigas inexistentes/incompletas.

UPDATE public.checkout_settings_canonical s SET
  enabled = v.enabled,
  active_provider = v.active_provider,
  channel = v.channel,
  experience = v.experience,
  updated_at = v.updated_at,
  notes = v.notes
FROM (
  SELECT
    COALESCE(c.enabled, false) AS enabled,
    CASE WHEN c.provider IN ('stripe', 'yampi', 'appmax') THEN c.provider ELSE 'stripe' END AS active_provider,
    CASE WHEN c.provider = 'yampi' THEN 'external'::text WHEN c.provider = 'stripe' AND (p.config->>'checkout_mode') = 'external' THEN 'external'::text ELSE 'internal'::text END AS channel,
    CASE WHEN c.provider = 'yampi' THEN 'native'::text WHEN c.provider = 'stripe' AND (p.config->>'checkout_mode') = 'external' THEN 'native'::text ELSE 'transparent'::text END AS experience,
    COALESCE(c.updated_at, now()) AS updated_at,
    'Migrado de integrations_checkout (PR8 seed)'::text AS notes
  FROM public.integrations_checkout c
  LEFT JOIN public.integrations_checkout_providers p ON p.provider = c.provider AND p.is_active = true
  ORDER BY c.updated_at DESC
  LIMIT 1
) v
WHERE s.id = '00000000-0000-0000-0000-000000000001'::uuid
  AND EXISTS (SELECT 1 FROM public.integrations_checkout LIMIT 1);
