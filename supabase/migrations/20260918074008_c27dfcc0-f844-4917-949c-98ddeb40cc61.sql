ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

CREATE OR REPLACE FUNCTION public.validate_profile_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status NOT IN ('approved','pending','disabled') THEN
    RAISE EXCEPTION 'invalid approval_status: %', NEW.approval_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_profile_approval_status_trg ON public.profiles;
CREATE TRIGGER validate_profile_approval_status_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_approval_status();

-- Backfill: existing accounts are never "pending"
UPDATE public.profiles p
SET approval_status = CASE WHEN p.is_active THEN 'approved' ELSE 'disabled' END;

-- New signups: pending unless created by an admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_created boolean := (NEW.raw_user_meta_data->>'created_by_admin') = 'true';
  v_company text := COALESCE(NEW.raw_user_meta_data->>'company', '한패스 모바일');
  v_has_roles boolean;
BEGIN
  IF v_company NOT IN ('한패스', '한패스 모바일') THEN
    v_company := '한패스 모바일';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles) INTO v_has_roles;

  INSERT INTO public.profiles (id, display_name, department, company, is_active, approval_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'department',
    v_company,
    (is_admin_created OR NOT v_has_roles),
    CASE WHEN (is_admin_created OR NOT v_has_roles) THEN 'approved' ELSE 'pending' END
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT v_has_roles THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSIF is_admin_created THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Keep approval_status in sync when an admin toggles active state
CREATE OR REPLACE FUNCTION public.admin_set_profile_active(_user_id uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
  SET is_active = _active,
      approval_status = CASE WHEN _active THEN 'approved' ELSE 'disabled' END,
      updated_at = now()
  WHERE id = _user_id;
END;
$$;