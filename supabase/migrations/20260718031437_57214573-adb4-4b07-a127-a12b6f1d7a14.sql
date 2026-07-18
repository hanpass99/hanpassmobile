CREATE OR REPLACE FUNCTION public.admin_set_profile_phone(_user_id uuid, _phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
    SET phone = NULLIF(regexp_replace(COALESCE(_phone, ''), '[^0-9]', '', 'g'), ''),
        updated_at = now()
  WHERE id = _user_id;
END;
$$;