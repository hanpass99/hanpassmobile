-- Fix 1: Add explicit UPDATE policy for customer_notes (author or admin only)
CREATE POLICY "notes_update_author_or_admin"
ON public.customer_notes
FOR UPDATE
TO authenticated
USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Fix 2: Prevent country-scoped staff from reassigning customers away from
-- the current owner or to a user other than themselves.
CREATE OR REPLACE FUNCTION public.prevent_assigned_to_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Unassigned record may be self-claimed (matches auto_assign_on_status_change)
    IF OLD.assigned_to IS NULL AND NEW.assigned_to = auth.uid() THEN
      RETURN NEW;
    END IF;
    -- Unassigning back to NULL (e.g. status -> 'new' via unassign_on_new_status trigger) is fine
    IF NEW.assigned_to IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'forbidden: cannot reassign customer to another user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_assigned_to_escalation ON public.customers;
CREATE TRIGGER prevent_assigned_to_escalation
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.prevent_assigned_to_escalation();