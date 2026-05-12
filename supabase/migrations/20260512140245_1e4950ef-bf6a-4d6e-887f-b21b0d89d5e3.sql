
CREATE OR REPLACE FUNCTION public.admin_set_profile_countries(_user_id uuid, _country_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.profile_countries WHERE user_id = _user_id;
  IF _country_ids IS NOT NULL AND array_length(_country_ids, 1) > 0 THEN
    INSERT INTO public.profile_countries (user_id, country_id)
    SELECT _user_id, unnest(_country_ids)
    ON CONFLICT DO NOTHING;
  END IF;
  -- 호환성: 단일 country_id 컬럼은 첫 번째 값으로 유지(또는 NULL)
  UPDATE public.profiles
  SET country_id = CASE WHEN _country_ids IS NULL OR array_length(_country_ids, 1) = 0
                        THEN NULL ELSE _country_ids[1] END,
      updated_at = now()
  WHERE id = _user_id;
END $$;
