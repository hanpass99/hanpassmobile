CREATE OR REPLACE FUNCTION public.auto_assign_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins never get auto-assigned as the owner.
  IF public.has_role(uid, 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NULL THEN
      NEW.assigned_to := uid;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- When a staff member changes the status, they take over as the assignee.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.assigned_to := uid;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;