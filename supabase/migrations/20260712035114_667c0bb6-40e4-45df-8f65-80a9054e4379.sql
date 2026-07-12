CREATE OR REPLACE FUNCTION public.normalize_google_form_phone(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g') ~ '^010[0-9]{8}$'
      THEN regexp_replace(regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g'), '^(010)([0-9]{4})([0-9]{4})$', '\1-\2-\3')
    WHEN regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g') ~ '^8210[0-9]{8}$'
      THEN regexp_replace(regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g'), '^(8210)([0-9]{4})([0-9]{4})$', '\1-\2-\3')
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.enforce_google_form_customer_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pool = 'google_form_activation'::public.customer_pool THEN
    NEW.phone := public.normalize_google_form_phone(NEW.phone);
    IF NEW.phone IS NULL THEN
      RAISE EXCEPTION 'Invalid google form phone number'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_google_form_customer_phone ON public.customers;
CREATE TRIGGER trg_enforce_google_form_customer_phone
BEFORE INSERT OR UPDATE OF phone, pool ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_google_form_customer_phone();

CREATE OR REPLACE FUNCTION public.enforce_google_form_submission_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone := public.normalize_google_form_phone(NEW.phone);
  IF NEW.phone IS NULL THEN
    RAISE EXCEPTION 'Invalid google form phone number'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_google_form_submission_phone ON public.google_form_submissions;
CREATE TRIGGER trg_enforce_google_form_submission_phone
BEFORE INSERT OR UPDATE OF phone ON public.google_form_submissions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_google_form_submission_phone();