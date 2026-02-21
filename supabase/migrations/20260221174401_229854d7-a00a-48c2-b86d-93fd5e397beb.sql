
-- Table to audit all cleanup runs
CREATE TABLE public.cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL, -- 'daily_logs', 'daily_storage', 'weekly_optimize'
  mode text NOT NULL DEFAULT 'execute', -- 'dry_run' or 'execute'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  records_deleted integer DEFAULT 0,
  records_consolidated integer DEFAULT 0,
  bytes_freed bigint DEFAULT 0,
  details jsonb DEFAULT '{}'::jsonb,
  errors text[],
  status text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cleanup_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cleanup_runs" ON public.cleanup_runs
  FOR SELECT USING (is_admin());

CREATE POLICY "Service can insert cleanup_runs" ON public.cleanup_runs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update cleanup_runs" ON public.cleanup_runs
  FOR UPDATE USING (true);

-- Daily stats aggregation table for logs
CREATE TABLE public.log_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date date NOT NULL,
  log_source text NOT NULL, -- 'error_logs', 'app_logs', 'appmax_logs', etc.
  total_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  warning_count integer DEFAULT 0,
  info_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stat_date, log_source)
);

ALTER TABLE public.log_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view log_daily_stats" ON public.log_daily_stats
  FOR SELECT USING (is_admin());

CREATE POLICY "Service can insert log_daily_stats" ON public.log_daily_stats
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_cleanup_runs_job_type ON public.cleanup_runs(job_type, started_at DESC);
CREATE INDEX idx_log_daily_stats_date ON public.log_daily_stats(stat_date DESC);
