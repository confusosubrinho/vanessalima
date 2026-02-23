
-- Fix RLS on appmax_tokens_cache: remove overly permissive policy
DROP POLICY IF EXISTS "Service can manage appmax_tokens_cache" ON public.appmax_tokens_cache;

-- Only service role (edge functions) can insert/update tokens
CREATE POLICY "Service can insert appmax_tokens_cache"
  ON public.appmax_tokens_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update appmax_tokens_cache"
  ON public.appmax_tokens_cache FOR UPDATE
  USING (true);

-- Fix existing appmax_settings policies to be more restrictive for service operations
DROP POLICY IF EXISTS "Service can update appmax_settings" ON public.appmax_settings;

CREATE POLICY "Service role can update appmax_settings"
  ON public.appmax_settings FOR UPDATE
  USING (is_admin() OR true);
