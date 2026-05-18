ALTER TABLE public.customer_call_rounds
DROP CONSTRAINT IF EXISTS customer_call_rounds_unique;

CREATE UNIQUE INDEX IF NOT EXISTS customer_call_rounds_staff_customer_date_unique
ON public.customer_call_rounds (staff_id, customer_id, call_date);

CREATE OR REPLACE FUNCTION public.record_call_round()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.call_round IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.call_round IS DISTINCT FROM OLD.call_round)
     AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.customer_call_rounds (customer_id, staff_id, round, call_date)
    VALUES (NEW.id, auth.uid(), NEW.call_round, CURRENT_DATE)
    ON CONFLICT (staff_id, customer_id, call_date)
    DO UPDATE SET round = EXCLUDED.round, updated_at = now();
  END IF;

  RETURN NEW;
END $function$;