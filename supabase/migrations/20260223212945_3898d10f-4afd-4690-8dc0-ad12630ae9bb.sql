
-- Create appmax_handshake_logs table for diagnostic logging
CREATE TABLE public.appmax_handshake_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  environment text NOT NULL,
  stage text NOT NULL,
  external_key text,
  request_id text,
  ok boolean NOT NULL DEFAULT false,
  http_status integer,
  message text NOT NULL,
  payload jsonb,
  headers jsonb,
  error_stack text
);

-- Indexes
CREATE INDEX idx_appmax_handshake_logs_created_at ON public.appmax_handshake_logs (created_at DESC);
CREATE INDEX idx_appmax_handshake_logs_stage_created ON public.appmax_handshake_logs (stage, created_at DESC);
CREATE INDEX idx_appmax_handshake_logs_extkey_created ON public.appmax_handshake_logs (external_key, created_at DESC);

-- Enable RLS
ALTER TABLE public.appmax_handshake_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view logs
CREATE POLICY "Admins can view handshake logs"
ON public.appmax_handshake_logs
FOR SELECT
USING (is_admin());

-- Admins can delete logs
CREATE POLICY "Admins can delete handshake logs"
ON public.appmax_handshake_logs
FOR DELETE
USING (is_admin());

-- Service/edge functions can insert logs (open insert for service role)
CREATE POLICY "Service can insert handshake logs"
ON public.appmax_handshake_logs
FOR INSERT
WITH CHECK (true);
