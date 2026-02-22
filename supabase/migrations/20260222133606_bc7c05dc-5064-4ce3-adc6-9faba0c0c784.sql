
-- Create appmax_settings table for bootstrap configuration
CREATE TABLE public.appmax_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  environment text NOT NULL DEFAULT 'sandbox',
  app_id text,
  client_id text,
  client_secret text,
  callback_url text,
  healthcheck_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT appmax_settings_environment_key UNIQUE (environment)
);

-- Enable RLS
ALTER TABLE public.appmax_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage
CREATE POLICY "Admins can manage appmax_settings"
  ON public.appmax_settings FOR ALL
  USING (is_admin());

-- Service role can insert/update (for edge functions)
CREATE POLICY "Service can insert appmax_settings"
  ON public.appmax_settings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update appmax_settings"
  ON public.appmax_settings FOR UPDATE
  USING (true);

-- Anyone can read (edge functions need this)
CREATE POLICY "Anyone can read appmax_settings"
  ON public.appmax_settings FOR SELECT
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_appmax_settings_updated_at
  BEFORE UPDATE ON public.appmax_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default sandbox row
INSERT INTO public.appmax_settings (environment, healthcheck_url, callback_url)
VALUES (
  'sandbox',
  'https://sojrvsbqkrbxoymlwtii.supabase.co/functions/v1/appmax-healthcheck',
  'https://vanessalima.lovable.app/admin/integrations/appmax/callback'
);
