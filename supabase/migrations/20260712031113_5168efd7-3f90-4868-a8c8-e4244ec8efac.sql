CREATE OR REPLACE FUNCTION public.auto_assign_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Stamp status change on insert.
    NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());

    -- Google Form applications must enter the queue unassigned.
    -- They are synced/imported records, so the signed-in sync user should not
    -- become the owner automatically.
    IF NEW.pool = 'google_form_activation'::public.customer_pool THEN
      NEW.assigned_to := NULL;
      NEW.status_changed_by := NULL;
      RETURN NEW;
    END IF;

    NEW.status_changed_by := uid;

    IF uid IS NOT NULL
       AND NEW.assigned_to IS NULL
       AND NOT public.has_role(uid, 'admin'::public.app_role) THEN
      NEW.assigned_to := uid;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status_changed_at := now();
      NEW.status_changed_by := uid;

      -- When a staff member changes the status, they take over as the assignee.
      IF uid IS NOT NULL
         AND NEW.pool <> 'google_form_activation'::public.customer_pool
         AND NOT public.has_role(uid, 'admin'::public.app_role) THEN
        NEW.assigned_to := uid;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_assign_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Google Form applications should not be auto-assigned by status changes.
  IF NEW.pool = 'google_form_activation'::public.customer_pool THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'new'::public.customer_status
     AND auth.uid() IS NOT NULL THEN
    NEW.assigned_to := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;