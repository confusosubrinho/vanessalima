
-- PART 1: Multi-Admin
CREATE TABLE IF NOT EXISTS public.admin_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('owner', 'manager', 'operator', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT now(),
  last_access TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage team" ON public.admin_members FOR ALL USING (is_admin());

-- Audit Log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  resource_name TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit log" ON public.admin_audit_log FOR SELECT USING (is_admin());
CREATE POLICY "System can insert audit log" ON public.admin_audit_log FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON public.admin_audit_log(resource_type, resource_id);

-- PART 5: Expand coupons
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'standard'
    CHECK (type IN ('standard', 'free_shipping', 'first_purchase')),
  ADD COLUMN IF NOT EXISTS applicable_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_bulk BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS bulk_prefix TEXT,
  ADD COLUMN IF NOT EXISTS bulk_count INTEGER;
