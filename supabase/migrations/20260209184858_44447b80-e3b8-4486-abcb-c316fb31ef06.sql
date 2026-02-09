
-- 0. Create has_role function first
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 1. Login attempts table for rate limiting / anti-spam
CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_hash text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean DEFAULT false
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view login attempts"
ON public.login_attempts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can insert login attempts"
ON public.login_attempts FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE INDEX idx_login_attempts_email_time ON public.login_attempts(email, attempted_at DESC);

-- 2. Prevent unauthorized admin role creation
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_admin_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count int;
  caller_is_admin boolean;
BEGIN
  IF NEW.role != 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count = 0 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO caller_is_admin;

  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores existentes podem criar novas contas admin';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_admin_creation
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unauthorized_admin_creation();

-- 3. Rate limit check function
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) < 5
  FROM public.login_attempts
  WHERE email = lower(p_email)
    AND attempted_at > now() - interval '15 minutes'
    AND success = false;
$$;
