CREATE OR REPLACE FUNCTION public.is_approved_staff(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.approval_status = 'approved' AND p.is_active = true) $$;
REVOKE ALL ON FUNCTION public.is_approved_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_staff(uuid) TO authenticated, service_role;

-- Restrictive policies are ANDed with every existing permissive policy, including ALL policies.
-- Keep existing country/ownership/company scopes exactly intact for approved users.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT schemaname, tablename FROM pg_policies WHERE schemaname = 'public' AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[]) AND tablename <> 'profiles' LOOP
  EXECUTE format('CREATE POLICY approved_staff_required ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_approved_staff(auth.uid()))) WITH CHECK ((SELECT public.is_approved_staff(auth.uid())))', r.schemaname, r.tablename);
 END LOOP;
END $$;
CREATE POLICY approved_staff_profile_read ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated USING (id = auth.uid() OR (SELECT public.is_approved_staff(auth.uid())));
CREATE POLICY approved_staff_profile_insert ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_approved_staff(auth.uid())));
CREATE POLICY approved_staff_profile_update ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.is_approved_staff(auth.uid()))) WITH CHECK ((SELECT public.is_approved_staff(auth.uid())));
CREATE POLICY approved_staff_profile_delete ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.is_approved_staff(auth.uid())));
CREATE POLICY own_profile_waiting_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY approved_staff_telegram_media ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING (bucket_id <> 'telegram-media' OR (SELECT public.is_approved_staff(auth.uid()))) WITH CHECK (bucket_id <> 'telegram-media' OR (SELECT public.is_approved_staff(auth.uid())));

ALTER POLICY ai_settings_all_authenticated ON public.ai_reply_settings USING (public.is_approved_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin')) WITH CHECK (public.is_approved_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY ai_settings_approved_read ON public.ai_reply_settings FOR SELECT TO authenticated USING (public.is_approved_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_approved_staff(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Self profile updates must not become an approval/country/department access escalation.
CREATE FUNCTION public.protect_profile_access_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') AND
 (NEW.approval_status IS DISTINCT FROM OLD.approval_status OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.country_id IS DISTINCT FROM OLD.country_id OR NEW.company IS DISTINCT FROM OLD.company OR NEW.can_access_new_signup IS DISTINCT FROM OLD.can_access_new_signup OR NEW.can_access_telegram IS DISTINCT FROM OLD.can_access_telegram) THEN
  RAISE EXCEPTION 'forbidden';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_profile_access_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access_fields();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 is_admin_created boolean := COALESCE((NEW.raw_app_meta_data->>'created_by_admin') = 'true', false);
 v_company text := COALESCE(NEW.raw_user_meta_data->>'company', '한패스 모바일');
 v_country uuid; v_has_roles boolean; v_approved boolean;
BEGIN
 IF v_company NOT IN ('한패스', '한패스 모바일') THEN v_company := '한패스 모바일'; END IF;
 BEGIN v_country := NULLIF(NEW.raw_user_meta_data->>'country_id', '')::uuid; EXCEPTION WHEN others THEN v_country := NULL; END;
 IF v_country IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.countries WHERE id = v_country AND is_active) THEN v_country := NULL; END IF;
 SELECT EXISTS (SELECT 1 FROM public.user_roles) INTO v_has_roles;
 v_approved := is_admin_created OR NOT v_has_roles;
 INSERT INTO public.profiles (id, display_name, department, company, is_active, approval_status, country_id)
 VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data->>'department', v_company, v_approved, CASE WHEN v_approved THEN 'approved' ELSE 'pending' END, v_country) ON CONFLICT (id) DO NOTHING;
 IF v_approved AND v_country IS NOT NULL THEN
  INSERT INTO public.profile_countries (user_id, country_id) VALUES (NEW.id, v_country) ON CONFLICT DO NOTHING;
 END IF;
 IF NOT v_has_roles THEN INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
 ELSIF is_admin_created THEN INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff') ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.grant_country_on_staff_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.approval_status = 'approved' AND NEW.is_active AND (OLD.approval_status <> 'approved' OR NOT OLD.is_active) AND NEW.country_id IS NOT NULL THEN
  INSERT INTO public.profile_countries (user_id, country_id) VALUES (NEW.id, NEW.country_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grant_country_on_staff_approval AFTER UPDATE OF approval_status, is_active ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.grant_country_on_staff_approval();

CREATE OR REPLACE FUNCTION public.admin_set_profile_active(_user_id uuid, _active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE public.profiles SET is_active = _active, approval_status = CASE WHEN _active THEN 'approved' ELSE 'disabled' END, updated_at = now() WHERE id = _user_id;
END $$;