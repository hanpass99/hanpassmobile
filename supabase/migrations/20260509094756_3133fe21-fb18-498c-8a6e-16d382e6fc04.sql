-- Add country to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_id uuid;

-- Helper: current user's country
CREATE OR REPLACE FUNCTION public.current_user_country()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT country_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Admin RPC to set country
CREATE OR REPLACE FUNCTION public.admin_set_profile_country(_user_id uuid, _country_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles SET country_id = _country_id, updated_at = now() WHERE id = _user_id;
END;
$$;

-- Replace customer SELECT policy: admin sees all, staff sees only their country (or assigned to them)
DROP POLICY IF EXISTS customers_read ON public.customers;
CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
  OR (country_id IS NOT NULL AND country_id = public.current_user_country())
);

-- Replace call_logs SELECT policy similarly via customer relation
DROP POLICY IF EXISTS call_logs_read ON public.call_logs;
CREATE POLICY call_logs_read ON public.call_logs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR staff_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = call_logs.customer_id
      AND c.country_id IS NOT NULL
      AND c.country_id = public.current_user_country()
  )
);