
-- 1) Add per-staff permission flag for the new_signup pool
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_access_new_signup boolean NOT NULL DEFAULT false;

-- 2) Security definer helper to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.can_access_new_signup(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT can_access_new_signup FROM public.profiles WHERE id = _user_id), false)
$$;

-- 3) Restrict reading new_signup customers to admins or permitted staff
DROP POLICY IF EXISTS customers_read ON public.customers;
CREATE POLICY customers_read ON public.customers
FOR SELECT TO authenticated
USING (
  (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
    OR (country_id IS NOT NULL AND country_id = ANY (current_user_countries()))
  )
  AND (
    pool <> 'new_signup'::customer_pool
    OR has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_new_signup(auth.uid())
  )
);

-- 4) Restrict updating new_signup customers similarly
DROP POLICY IF EXISTS customers_update_staff ON public.customers;
CREATE POLICY customers_update_staff ON public.customers
FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    pool <> 'new_signup'::customer_pool
    OR has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_new_signup(auth.uid())
  )
);

-- 5) Admin helper to set the flag
CREATE OR REPLACE FUNCTION public.admin_set_profile_new_signup_access(_user_id uuid, _value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles SET can_access_new_signup = _value, updated_at = now() WHERE id = _user_id;
END;
$$;
