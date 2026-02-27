-- FASE 4: Observabilidade — correlation_id por ação admin (admin_audit_log)
ALTER TABLE public.admin_audit_log
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_correlation_id
  ON public.admin_audit_log (correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMENT ON COLUMN public.admin_audit_log.correlation_id IS 'ID de correlação para rastrear uma ação admin em múltiplos logs/eventos';
