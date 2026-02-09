
-- Drop and recreate store_settings policies  
DROP POLICY IF EXISTS "Anyone can view settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins manage settings" ON public.store_settings;

CREATE POLICY "Public view settings" ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "Admin manage settings" ON public.store_settings FOR ALL USING (is_admin());

-- Instagram anon
DROP POLICY IF EXISTS "Anon view instagram" ON public.instagram_videos;
CREATE POLICY "Anon view instagram" ON public.instagram_videos FOR SELECT TO anon USING (true);

-- Error logs table
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  error_context JSONB DEFAULT '{}',
  page_url TEXT,
  user_id UUID,
  user_agent TEXT,
  severity TEXT DEFAULT 'error',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert errors" ON public.error_logs;
DROP POLICY IF EXISTS "Admins view errors" ON public.error_logs;
DROP POLICY IF EXISTS "Admins update errors" ON public.error_logs;
DROP POLICY IF EXISTS "Admins delete errors" ON public.error_logs;

CREATE POLICY "Insert errors" ON public.error_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "View errors" ON public.error_logs FOR SELECT USING (is_admin());
CREATE POLICY "Update errors" ON public.error_logs FOR UPDATE USING (is_admin());
CREATE POLICY "Delete errors" ON public.error_logs FOR DELETE USING (is_admin());
