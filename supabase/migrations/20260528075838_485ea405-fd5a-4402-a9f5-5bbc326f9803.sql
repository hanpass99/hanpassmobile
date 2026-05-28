CREATE OR REPLACE FUNCTION public.auto_assign_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assigned_to IS NULL
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.assigned_to := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;