
-- helpers
CREATE OR REPLACE FUNCTION public.user_company(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company FROM public.profiles WHERE id = _uid
$$;

CREATE OR REPLACE FUNCTION public.is_hanpass_company(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND company = '한패스')
$$;

-- migrate hanpass_staff role holders to company + staff role
UPDATE public.profiles p SET company = '한패스'
WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'hanpass_staff');

INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'staff'::app_role FROM public.user_roles WHERE role = 'hanpass_staff'
ON CONFLICT DO NOTHING;

DELETE FROM public.user_roles WHERE role = 'hanpass_staff';

-- customers policies
DROP POLICY IF EXISTS customers_hanpass_select ON public.customers;
DROP POLICY IF EXISTS customers_hanpass_insert ON public.customers;
DROP POLICY IF EXISTS customers_hanpass_update ON public.customers;
DROP POLICY IF EXISTS customers_hanpass_delete ON public.customers;
DROP POLICY IF EXISTS customers_read ON public.customers;
DROP POLICY IF EXISTS customers_insert ON public.customers;
DROP POLICY IF EXISTS customers_update_staff ON public.customers;
DROP POLICY IF EXISTS customers_delete_admin ON public.customers;

CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated
USING (
  NOT (SELECT public.is_hanpass_company(auth.uid()))
  AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role))
       OR assigned_to = (SELECT auth.uid())
       OR (country_id IS NOT NULL AND country_id = ANY ((SELECT public.current_user_countries())::uuid[])))
  AND (pool <> 'new_signup'::customer_pool
       OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
       OR (SELECT public.can_access_new_signup(auth.uid())))
);

CREATE POLICY customers_insert ON public.customers FOR INSERT TO authenticated
WITH CHECK (
  NOT (SELECT public.is_hanpass_company(auth.uid()))
  AND auth.uid() IS NOT NULL
  AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role)) OR assigned_to = auth.uid())
  AND (pool <> 'new_signup'::customer_pool
       OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
       OR (SELECT public.can_access_new_signup(auth.uid())))
);

CREATE POLICY customers_update_staff ON public.customers FOR UPDATE TO authenticated
USING (
  NOT (SELECT public.is_hanpass_company(auth.uid()))
  AND auth.uid() IS NOT NULL
  AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role))
       OR assigned_to = (SELECT auth.uid())
       OR (country_id IS NOT NULL AND country_id = ANY ((SELECT public.current_user_countries())::uuid[])))
  AND (pool <> 'new_signup'::customer_pool
       OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
       OR (SELECT public.can_access_new_signup(auth.uid())))
);

CREATE POLICY customers_delete_admin ON public.customers FOR DELETE TO authenticated
USING (NOT (SELECT public.is_hanpass_company(auth.uid()))
       AND (SELECT public.has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY customers_hanpass_select ON public.customers FOR SELECT TO authenticated
USING (
  (SELECT public.is_hanpass_company(auth.uid()))
  AND pool IN ('activation_request','qr_activation','friend_referral','prepaid_charge')
  AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role))
       OR assigned_to = (SELECT auth.uid())
       OR (country_id IS NOT NULL AND country_id = ANY ((SELECT public.current_user_countries())::uuid[])))
);

CREATE POLICY customers_hanpass_insert ON public.customers FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_hanpass_company(auth.uid()))
  AND pool IN ('activation_request','qr_activation','friend_referral','prepaid_charge')
  AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role))
       OR (country_id IS NOT NULL AND country_id = ANY ((SELECT public.current_user_countries())::uuid[])))
);

CREATE POLICY customers_hanpass_update ON public.customers FOR UPDATE TO authenticated
USING (
  (SELECT public.is_hanpass_company(auth.uid()))
  AND pool IN ('activation_request','qr_activation','friend_referral','prepaid_charge')
  AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role))
       OR assigned_to = (SELECT auth.uid())
       OR (country_id IS NOT NULL AND country_id = ANY ((SELECT public.current_user_countries())::uuid[])))
)
WITH CHECK (
  (SELECT public.is_hanpass_company(auth.uid()))
  AND pool IN ('activation_request','qr_activation','friend_referral','prepaid_charge')
);

CREATE POLICY customers_hanpass_delete ON public.customers FOR DELETE TO authenticated
USING (
  (SELECT public.is_hanpass_company(auth.uid()))
  AND pool IN ('activation_request','qr_activation','friend_referral','prepaid_charge')
  AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role))
       OR (country_id IS NOT NULL AND country_id = ANY ((SELECT public.current_user_countries())::uuid[])))
);

-- customer_notes hanpass policy
DROP POLICY IF EXISTS customer_notes_hanpass_all ON public.customer_notes;
CREATE POLICY customer_notes_hanpass_all ON public.customer_notes FOR ALL TO authenticated
USING (
  (SELECT public.is_hanpass_company(auth.uid()))
  AND EXISTS (SELECT 1 FROM public.customers c
              WHERE c.id = customer_notes.customer_id
                AND c.pool IN ('activation_request','qr_activation','friend_referral','prepaid_charge'))
)
WITH CHECK (
  (SELECT public.is_hanpass_company(auth.uid()))
  AND author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.customers c
              WHERE c.id = customer_notes.customer_id
                AND c.pool IN ('activation_request','qr_activation','friend_referral','prepaid_charge'))
);

-- signup country
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  is_admin_created boolean := (NEW.raw_user_meta_data->>'created_by_admin') = 'true';
  v_company text := COALESCE(NEW.raw_user_meta_data->>'company', '한패스 모바일');
  v_country uuid;
  v_has_roles boolean;
BEGIN
  IF v_company NOT IN ('한패스', '한패스 모바일') THEN
    v_company := '한패스 모바일';
  END IF;

  BEGIN
    v_country := NULLIF(NEW.raw_user_meta_data->>'country_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_country := NULL;
  END;

  SELECT EXISTS (SELECT 1 FROM public.user_roles) INTO v_has_roles;

  INSERT INTO public.profiles (id, display_name, department, company, is_active, approval_status, country_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'department',
    v_company,
    (is_admin_created OR NOT v_has_roles),
    CASE WHEN (is_admin_created OR NOT v_has_roles) THEN 'approved' ELSE 'pending' END,
    v_country
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_country IS NOT NULL THEN
    INSERT INTO public.profile_countries (user_id, country_id)
    VALUES (NEW.id, v_country) ON CONFLICT DO NOTHING;
  END IF;

  IF NOT v_has_roles THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSIF is_admin_created THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_own_country(_country_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profile_countries WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'country already set';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE id = _country_id) THEN
    RAISE EXCEPTION 'invalid country';
  END IF;
  INSERT INTO public.profile_countries (user_id, country_id) VALUES (auth.uid(), _country_id)
  ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET country_id = _country_id WHERE id = auth.uid();
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_own_country(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hanpass_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_company(uuid) TO authenticated;

-- indexes
CREATE INDEX IF NOT EXISTS customers_pool_imported_at_idx ON public.customers (pool, imported_at DESC);
CREATE INDEX IF NOT EXISTS customers_country_id_idx ON public.customers (country_id);
CREATE INDEX IF NOT EXISTS customers_assigned_to_idx ON public.customers (assigned_to);
CREATE INDEX IF NOT EXISTS customers_pool_country_idx ON public.customers (pool, country_id);
