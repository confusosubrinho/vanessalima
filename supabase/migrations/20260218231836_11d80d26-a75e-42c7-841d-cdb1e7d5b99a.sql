
-- P1.1: Create app_logs table for standardized system logging
CREATE TABLE public.app_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  scope text NOT NULL DEFAULT 'general',
  message text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  user_id uuid,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view app logs" ON public.app_logs FOR SELECT USING (is_admin());
CREATE POLICY "Service can insert app logs" ON public.app_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can delete app logs" ON public.app_logs FOR DELETE USING (is_admin());

-- Index for fast filtering
CREATE INDEX idx_app_logs_scope ON public.app_logs (scope);
CREATE INDEX idx_app_logs_level ON public.app_logs (level);
CREATE INDEX idx_app_logs_created_at ON public.app_logs (created_at DESC);
CREATE INDEX idx_app_logs_correlation_id ON public.app_logs (correlation_id) WHERE correlation_id IS NOT NULL;
