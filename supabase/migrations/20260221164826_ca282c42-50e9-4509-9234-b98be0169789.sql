
-- Tabela de instalações Appmax
CREATE TABLE public.appmax_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_key text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  app_id text NOT NULL,
  installation_token text,
  merchant_client_id text,
  merchant_client_secret text,
  status text NOT NULL DEFAULT 'disconnected',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(external_key, environment)
);

ALTER TABLE public.appmax_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage appmax_installations"
  ON public.appmax_installations FOR ALL
  USING (public.is_admin());

CREATE POLICY "Admins can view appmax_installations"
  ON public.appmax_installations FOR SELECT
  USING (public.is_admin());

-- Tabela de logs Appmax
CREATE TABLE public.appmax_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  scope text NOT NULL DEFAULT 'appmax',
  message text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appmax_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view appmax_logs"
  ON public.appmax_logs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Service can insert appmax_logs"
  ON public.appmax_logs FOR INSERT
  WITH CHECK (true);

-- Trigger updated_at para appmax_installations
CREATE TRIGGER update_appmax_installations_updated_at
  BEFORE UPDATE ON public.appmax_installations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
