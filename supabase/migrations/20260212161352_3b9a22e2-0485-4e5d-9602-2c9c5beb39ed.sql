
-- Fix the security definer view by setting it to SECURITY INVOKER explicitly
ALTER VIEW public.store_settings_public SET (security_invoker = on);
