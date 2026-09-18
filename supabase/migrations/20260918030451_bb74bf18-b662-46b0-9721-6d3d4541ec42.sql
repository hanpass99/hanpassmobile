
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT '한패스 모바일';
UPDATE public.profiles SET company = '한패스 모바일' WHERE company IS NULL OR company NOT IN ('한패스', '한패스 모바일');

CREATE OR REPLACE FUNCTION public.validate_profile_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.company IS NULL OR NEW.company NOT IN ('한패스', '한패스 모바일') THEN
    RAISE EXCEPTION '소속은 한패스 또는 한패스 모바일이어야 합니다';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_profile_company_trg ON public.profiles;
CREATE TRIGGER validate_profile_company_trg
BEFORE INSERT OR UPDATE OF company ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_company();

CREATE OR REPLACE FUNCTION public.admin_set_profile_company(_user_id uuid, _company text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _company NOT IN ('한패스', '한패스 모바일') THEN
    RAISE EXCEPTION 'invalid company';
  END IF;
  UPDATE public.profiles SET company = _company, updated_at = now() WHERE id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_company(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_company(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_hanpass_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'hanpass_staff'::public.app_role
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_hanpass_staff(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_hanpass_staff(uuid) TO authenticated;

DROP POLICY IF EXISTS customers_hanpass_select ON public.customers;
CREATE POLICY customers_hanpass_select ON public.customers
FOR SELECT TO authenticated
USING (pool = 'activation_request'::public.customer_pool AND (SELECT public.is_hanpass_staff(auth.uid())));

DROP POLICY IF EXISTS customers_hanpass_insert ON public.customers;
CREATE POLICY customers_hanpass_insert ON public.customers
FOR INSERT TO authenticated
WITH CHECK (pool = 'activation_request'::public.customer_pool AND (SELECT public.is_hanpass_staff(auth.uid())));

DROP POLICY IF EXISTS customers_hanpass_update ON public.customers;
CREATE POLICY customers_hanpass_update ON public.customers
FOR UPDATE TO authenticated
USING (pool = 'activation_request'::public.customer_pool AND (SELECT public.is_hanpass_staff(auth.uid())))
WITH CHECK (pool = 'activation_request'::public.customer_pool AND (SELECT public.is_hanpass_staff(auth.uid())));

DROP POLICY IF EXISTS customers_hanpass_delete ON public.customers;
CREATE POLICY customers_hanpass_delete ON public.customers
FOR DELETE TO authenticated
USING (pool = 'activation_request'::public.customer_pool AND (SELECT public.is_hanpass_staff(auth.uid())));

DROP POLICY IF EXISTS customer_notes_hanpass_all ON public.customer_notes;
CREATE POLICY customer_notes_hanpass_all ON public.customer_notes
FOR ALL TO authenticated
USING ((SELECT public.is_hanpass_staff(auth.uid())) AND EXISTS (
  SELECT 1 FROM public.customers c WHERE c.id = customer_notes.customer_id AND c.pool = 'activation_request'::public.customer_pool))
WITH CHECK ((SELECT public.is_hanpass_staff(auth.uid())) AND author_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.customers c WHERE c.id = customer_notes.customer_id AND c.pool = 'activation_request'::public.customer_pool));
