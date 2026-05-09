
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

-- Allow admin to soft-delete (deactivate) a staff profile
CREATE OR REPLACE FUNCTION public.admin_set_profile_active(_user_id uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles SET is_active = _active, updated_at = now() WHERE id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_active(uuid, boolean) TO authenticated;

-- Allow admin to change a user's role
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role) TO authenticated;
