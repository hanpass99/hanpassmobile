CREATE OR REPLACE FUNCTION public.import_loan_borrowers(_token text, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF _token IS DISTINCT FROM 'lb-import-7f3a9c2e51d84b06' THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.loan_borrowers (name, phone, nationality, loan_start_date)
  SELECT r->>'name', r->>'phone', r->>'nationality', (r->>'date')::date FROM jsonb_array_elements(_rows) r;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.import_loan_borrowers(text, jsonb) TO anon;