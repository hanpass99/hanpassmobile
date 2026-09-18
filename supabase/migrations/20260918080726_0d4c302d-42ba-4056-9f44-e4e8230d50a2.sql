CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_created boolean := COALESCE((NEW.raw_user_meta_data->>'created_by_admin') = 'true', false);
  v_company text := COALESCE(NEW.raw_user_meta_data->>'company', '한패스 모바일');
  v_country uuid;
  v_has_roles boolean;
  v_approved boolean;
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
  v_approved := COALESCE(is_admin_created OR NOT COALESCE(v_has_roles, false), false);

  INSERT INTO public.profiles (id, display_name, department, company, is_active, approval_status, country_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'department',
    v_company,
    v_approved,
    CASE WHEN v_approved THEN 'approved' ELSE 'pending' END,
    v_country
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_country IS NOT NULL THEN
    INSERT INTO public.profile_countries (user_id, country_id)
    VALUES (NEW.id, v_country) ON CONFLICT DO NOTHING;
  END IF;

  IF NOT COALESCE(v_has_roles, false) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSIF is_admin_created THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;