
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_access_telegram boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_set_profile_telegram_access(_user_id uuid, _value boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles SET can_access_telegram = _value, updated_at = now() WHERE id = _user_id;
  RETURN _value;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_profile_telegram_access(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_telegram_access(uuid, boolean) TO authenticated;
