CREATE OR REPLACE FUNCTION public.prevent_assigned_to_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    -- Admins can reassign freely
    IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RETURN NEW;
    END IF;
    -- The current owner may release or transfer their own record
    IF OLD.assigned_to = auth.uid() THEN
      RETURN NEW;
    END IF;
    -- Any staff may claim the customer to themselves (e.g. via status change auto-assign)
    IF NEW.assigned_to = auth.uid() THEN
      RETURN NEW;
    END IF;
    -- Unassigning back to NULL is fine
    IF NEW.assigned_to IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'forbidden: cannot reassign customer to another user';
  END IF;
  RETURN NEW;
END;
$function$;