
-- =============================================
-- SECURITY FIX: RLS Policy Hardening
-- =============================================

-- 1. CRITICAL: Fix stock_notifications SELECT leak
-- The policy "Users can view own notifications" uses USING (email IS NOT NULL)
-- which exposes ALL notifications to ANY user. Remove it.
DROP POLICY IF EXISTS "Users can view own notifications" ON public.stock_notifications;

-- 2. MEDIUM: Tighten service-only INSERT/UPDATE policies
-- Edge functions use service_role key which bypasses RLS entirely.
-- These WITH CHECK (true) / USING (true) policies let anon/authenticated users pollute data.

-- inventory_movements: restrict INSERT to admins
DROP POLICY IF EXISTS "Service can insert inventory movements" ON public.inventory_movements;
CREATE POLICY "Service can insert inventory movements"
  ON public.inventory_movements FOR INSERT
  WITH CHECK (is_admin());

-- variation_value_map: restrict INSERT and UPDATE to admins
DROP POLICY IF EXISTS "Service can insert variation_value_map" ON public.variation_value_map;
CREATE POLICY "Service can insert variation_value_map"
  ON public.variation_value_map FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Service can update variation_value_map" ON public.variation_value_map;
CREATE POLICY "Service can update variation_value_map"
  ON public.variation_value_map FOR UPDATE
  USING (is_admin());

-- catalog_sync_runs: restrict INSERT and UPDATE to admins
DROP POLICY IF EXISTS "Service can insert catalog_sync_runs" ON public.catalog_sync_runs;
CREATE POLICY "Service can insert catalog_sync_runs"
  ON public.catalog_sync_runs FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Service can update catalog_sync_runs" ON public.catalog_sync_runs;
CREATE POLICY "Service can update catalog_sync_runs"
  ON public.catalog_sync_runs FOR UPDATE
  USING (is_admin());

-- cleanup_runs: restrict INSERT and UPDATE to admins
DROP POLICY IF EXISTS "Service can insert cleanup_runs" ON public.cleanup_runs;
CREATE POLICY "Service can insert cleanup_runs"
  ON public.cleanup_runs FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Service can update cleanup_runs" ON public.cleanup_runs;
CREATE POLICY "Service can update cleanup_runs"
  ON public.cleanup_runs FOR UPDATE
  USING (is_admin());

-- appmax_tokens_cache: restrict INSERT and UPDATE to admins
DROP POLICY IF EXISTS "Service can insert appmax_tokens_cache" ON public.appmax_tokens_cache;
CREATE POLICY "Service can insert appmax_tokens_cache"
  ON public.appmax_tokens_cache FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Service can update appmax_tokens_cache" ON public.appmax_tokens_cache;
CREATE POLICY "Service can update appmax_tokens_cache"
  ON public.appmax_tokens_cache FOR UPDATE
  USING (is_admin());

-- appmax_logs: restrict INSERT to admins
DROP POLICY IF EXISTS "Service can insert appmax_logs" ON public.appmax_logs;
CREATE POLICY "Service can insert appmax_logs"
  ON public.appmax_logs FOR INSERT
  WITH CHECK (is_admin());

-- log_daily_stats: restrict INSERT to admins
DROP POLICY IF EXISTS "Service can insert log_daily_stats" ON public.log_daily_stats;
CREATE POLICY "Service can insert log_daily_stats"
  ON public.log_daily_stats FOR INSERT
  WITH CHECK (is_admin());

-- 3. MEDIUM: Restrict admin_members management to owners only
-- Create is_owner() function
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_members
    WHERE user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  )
  OR
  -- Fallback: first admin in user_roles is treated as owner
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

-- Replace admin_members ALL policy with owner-only
DROP POLICY IF EXISTS "Admins can manage admin_members" ON public.admin_members;
CREATE POLICY "Owners can manage admin_members"
  ON public.admin_members FOR ALL
  USING (is_owner())
  WITH CHECK (is_owner());

-- Keep a SELECT policy so all active admins can see the team list
CREATE POLICY "Admins can view admin_members"
  ON public.admin_members FOR SELECT
  USING (is_admin());
