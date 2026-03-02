
-- Create checkout_settings table (singleton, used by checkout-router)
CREATE TABLE public.checkout_settings (
  id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  active_provider TEXT NOT NULL DEFAULT 'yampi',
  channel TEXT NOT NULL DEFAULT 'external',
  experience TEXT NOT NULL DEFAULT 'native',
  environment TEXT NOT NULL DEFAULT 'production',
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Insert default row matching current integrations_checkout config (yampi active)
INSERT INTO public.checkout_settings (id, enabled, active_provider, channel, experience)
VALUES ('00000000-0000-0000-0000-000000000001', true, 'yampi', 'external', 'native');

-- Enable RLS
ALTER TABLE public.checkout_settings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (needed by checkout-router via service role, and admin UI)
CREATE POLICY "Anyone can read checkout_settings"
  ON public.checkout_settings FOR SELECT USING (true);

-- Only admins can update
CREATE POLICY "Admins can update checkout_settings"
  ON public.checkout_settings FOR UPDATE USING (public.is_admin());
