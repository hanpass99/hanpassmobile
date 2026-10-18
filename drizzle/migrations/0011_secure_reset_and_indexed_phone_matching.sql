CREATE OR REPLACE FUNCTION public.normalized_phone_digits(raw text) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public AS $$
DECLARE digits text := regexp_replace(raw, '[^0-9]', '', 'g');
BEGIN
 IF digits='' THEN RETURN NULL; END IF;
 IF digits LIKE '0082%' THEN digits:=substring(digits FROM 5); END IF;
 IF digits LIKE '82%' AND length(digits)>=11 THEN digits:=substring(digits FROM 3); END IF;
 IF digits NOT LIKE '0%' AND digits ~ '^(1[016789]|2|3[1-3]|4[1-4]|5[1-5]|6[1-4])' THEN digits:='0'||digits; END IF;
 RETURN digits;
END $$;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone_digits text GENERATED ALWAYS AS (public.normalized_phone_digits(phone)) STORED;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_digits text GENERATED ALWAYS AS (public.normalized_phone_digits(phone)) STORED;
CREATE INDEX IF NOT EXISTS customers_phone_digits_idx ON public.customers(phone_digits);
CREATE INDEX IF NOT EXISTS profiles_phone_digits_idx ON public.profiles(phone_digits);
CREATE OR REPLACE FUNCTION public.is_approved_staff(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=uid AND p.approval_status='approved' AND p.is_active=true AND COALESCE(u.raw_app_meta_data->>'must_change_password','false') <> 'true')
$$;
REVOKE ALL ON FUNCTION public.is_approved_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_staff(uuid) TO authenticated,service_role;
-- Existing telegram_messages_chat_id_telegram_message_id_key already uniquely enforces inbound and outbound identities; no redundant partial index is needed.