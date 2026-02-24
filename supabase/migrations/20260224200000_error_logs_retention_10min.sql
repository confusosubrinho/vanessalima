-- Remove error_logs older than 10 minutes, every 10 minutes (so logs stay at most ~10 min)
-- Requires pg_cron (already enabled in 20260211183308).
SELECT cron.unschedule('cleanup_error_logs_10min');
SELECT cron.schedule(
  'cleanup_error_logs_10min',
  '*/10 * * * *',
  $$ DELETE FROM public.error_logs WHERE created_at < now() - interval '10 minutes' $$
);
